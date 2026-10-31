import { isNonEmptyString } from '@sniptt/guards';
import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  type ComposioResult,
  executeComposioTool,
} from 'src/logic-functions/utils/execute-composio-tool';
import { readApolloPerson } from 'src/logic-functions/utils/read-apollo-person';
import { readPerson } from 'src/logic-functions/utils/read-person';
import { readVariable } from 'src/logic-functions/utils/read-variable';
import { updatePerson } from 'src/logic-functions/utils/update-person';
import { type LeadResult } from 'src/types/lead-result';

const APOLLO_PEOPLE_ENRICHMENT = 'APOLLO_PEOPLE_ENRICHMENT';

const hostOf = (url: string | null | undefined): string | undefined => {
  if (!isNonEmptyString(url)) {
    return undefined;
  }

  try {
    return new URL(
      url.includes('://') ? url : `https://${url}`,
    ).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

type ExecuteTool = (
  toolSlug: string,
  toolArguments: Record<string, unknown>,
) => Promise<ComposioResult>;

export const enrichPersonWithApolloCore = async ({
  input,
  client = new CoreApiClient(),
  executeTool,
  now = () => new Date(),
}: {
  input: { recordId: string };
  client?: CoreApiClient;
  executeTool?: ExecuteTool;
  now?: () => Date;
}): Promise<LeadResult> => {
  const { recordId } = input;
  const apiKey = readVariable('COMPOSIO_API_KEY');
  const userId = readVariable('COMPOSIO_USER_ID');
  const execute: ExecuteTool | undefined =
    executeTool ??
    (apiKey && userId
      ? (toolSlug, toolArguments) =>
          executeComposioTool({ apiKey, userId, toolSlug, toolArguments })
      : undefined);

  if (!execute) {
    return {
      success: false,
      recordId,
      status: 'NOT_CONFIGURED',
      message:
        'Set COMPOSIO_API_KEY on the server and COMPOSIO_USER_ID in the app settings.',
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

  // Apollo's people/match keys; the LinkedIn link is the strongest match.
  const toolArguments = Object.fromEntries(
    Object.entries({
      linkedin_url: person.linkedinLink?.primaryLinkUrl,
      first_name: person.name?.firstName,
      last_name: person.name?.lastName,
      organization_name: person.company?.name,
      domain: hostOf(person.company?.domainName?.primaryLinkUrl),
    }).filter(([, value]) => isNonEmptyString(value)),
  );

  const result = await execute(APOLLO_PEOPLE_ENRICHMENT, toolArguments);
  const enrichedAt = now().toISOString();

  if (!result.ok) {
    await updatePerson({
      client,
      recordId,
      data: { desyncEnrichmentStatus: 'ERROR', desyncEnrichedAt: enrichedAt },
    });

    return { success: false, recordId, status: 'ERROR', message: result.error };
  }

  const suggestion = readApolloPerson(result.data);

  // Suggestions only: the person's own Emails and Job Title stay as they are.
  await updatePerson({
    client,
    recordId,
    data: {
      desyncEnrichmentStatus: suggestion ? 'MATCHED' : 'NOT_FOUND',
      desyncEnrichedAt: enrichedAt,
      ...(suggestion?.email ? { desyncSuggestedEmail: suggestion.email } : {}),
      ...(suggestion?.jobTitle
        ? { desyncSuggestedJobTitle: suggestion.jobTitle }
        : {}),
    },
  });

  return {
    success: true,
    recordId,
    status: suggestion ? 'MATCHED' : 'NOT_FOUND',
    message: suggestion ? 'Apollo found a match.' : 'Apollo found no match.',
    data: { ...suggestion },
  };
};
