import { isNonEmptyString } from '@sniptt/guards';
import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  type ComposioResult,
  executeComposioTool,
} from 'src/logic-functions/utils/execute-composio-tool';
import { readPerson } from 'src/logic-functions/utils/read-person';
import { readVariable } from 'src/logic-functions/utils/read-variable';
import { updatePerson } from 'src/logic-functions/utils/update-person';
import { type LeadResult } from 'src/types/lead-result';

const INSTANTLY_CREATE_LEAD = 'INSTANTLY_CREATE_LEAD';

type ExecuteTool = (
  toolSlug: string,
  toolArguments: Record<string, unknown>,
) => Promise<ComposioResult>;

export const sendPersonToInstantlyCore = async ({
  input,
  client = new CoreApiClient(),
  executeTool,
  now = () => new Date(),
}: {
  input: { recordId: string; campaignId?: string };
  client?: CoreApiClient;
  executeTool?: ExecuteTool;
  now?: () => Date;
}): Promise<LeadResult> => {
  const { recordId } = input;
  const requestedCampaignId = input.campaignId?.trim();
  const campaignId = isNonEmptyString(requestedCampaignId)
    ? requestedCampaignId
    : readVariable('INSTANTLY_CAMPAIGN_ID');
  const apiKey = readVariable('COMPOSIO_API_KEY');
  const userId = readVariable('COMPOSIO_USER_ID');
  const execute: ExecuteTool | undefined =
    executeTool ??
    (apiKey && userId
      ? (toolSlug, toolArguments) =>
          executeComposioTool({ apiKey, userId, toolSlug, toolArguments })
      : undefined);

  if (!execute || !campaignId) {
    return {
      success: false,
      recordId,
      status: 'NOT_CONFIGURED',
      message:
        'Set COMPOSIO_API_KEY on the server, and COMPOSIO_USER_ID and INSTANTLY_CAMPAIGN_ID in the app settings.',
    };
  }

  const person = await readPerson({ client, recordId });

  if (!person) {
    return {
      success: false,
      recordId,
      status: 'NOT_FOUND',
      message: 'No such person.',
    };
  }

  // The person's own email first; Apollo's suggestion only when there is none.
  const email = [person.emails?.primaryEmail, person.desyncSuggestedEmail]
    .map((value) => value?.trim())
    .find(isNonEmptyString);

  if (!email) {
    return {
      success: false,
      recordId,
      status: 'NO_EMAIL',
      message: 'No email to send: enrich with Apollo first, or add one.',
    };
  }

  const result = await execute(
    INSTANTLY_CREATE_LEAD,
    Object.fromEntries(
      Object.entries({
        campaign: campaignId,
        email,
        first_name: person.name?.firstName,
        last_name: person.name?.lastName,
        company_name: person.company?.name,
      }).filter(([, value]) => isNonEmptyString(value)),
    ),
  );

  if (!result.ok) {
    return { success: false, recordId, status: 'ERROR', message: result.error };
  }

  await updatePerson({
    client,
    recordId,
    data: { desyncSentToInstantlyAt: now().toISOString() },
  });

  return {
    success: true,
    recordId,
    status: 'SENT',
    message: `Added ${email} to the Instantly campaign.`,
  };
};
