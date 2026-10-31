import { CoreApiClient } from 'twenty-client-sdk/core';

import { createAskJev } from 'src/logic-functions/utils/ask-jev';
import { buildPersonSpec } from 'src/logic-functions/utils/build-person-spec';
import { decideLeadKind } from 'src/logic-functions/utils/decide-lead-kind';
import { readPerson } from 'src/logic-functions/utils/read-person';
import { readVariable } from 'src/logic-functions/utils/read-variable';
import { updatePerson } from 'src/logic-functions/utils/update-person';
import { type AskJev } from 'src/types/jev';
import { type LeadResult } from 'src/types/lead-result';

export const classifyPersonCore = async ({
  input,
  client = new CoreApiClient(),
  askJev,
  now = () => new Date(),
}: {
  input: { recordId: string };
  client?: CoreApiClient;
  askJev?: AskJev;
  now?: () => Date;
}): Promise<LeadResult> => {
  const { recordId } = input;
  const apiKey = readVariable('TYPESAFE_API_KEY');
  const ask =
    askJev ??
    (apiKey
      ? createAskJev({ apiKey, model: readVariable('TYPESAFE_MODEL') })
      : undefined);

  if (!ask) {
    return {
      success: false,
      recordId,
      status: 'NOT_CONFIGURED',
      message: 'TYPESAFE_API_KEY is not set on this server.',
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

  const icpRubric = readVariable('ICP_RUBRIC');
  const spec = buildPersonSpec(person, icpRubric);
  // A failed call writes nothing, so an outage never marks a person as read.
  const decision = decideLeadKind(await ask(spec), 'icp' in spec.questions);

  await updatePerson({
    client,
    recordId,
    data: {
      desyncLeadKind: decision.kind,
      desyncLeadScore: decision.score,
      desyncClassifiedAt: now().toISOString(),
    },
  });

  return {
    success: true,
    recordId,
    status: decision.kind,
    message: icpRubric
      ? `Classified as ${decision.kind}.`
      : `Classified as ${decision.kind}. Set ICP_RUBRIC to also mark ICP.`,
    data: { ...decision },
  };
};
