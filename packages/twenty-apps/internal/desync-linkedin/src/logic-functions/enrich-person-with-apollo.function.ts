import {
  defineLogicFunction,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_LOGIC_FUNCTION_CONSTANTS } from 'src/constants/universal-identifiers';
import { enrichPersonWithApolloCore } from 'src/logic-functions/handlers/enrich-person-with-apollo';

const handler = (input: { recordId: string }) =>
  enrichPersonWithApolloCore({ input });

export default defineLogicFunction({
  universalIdentifier:
    DESYNC_LOGIC_FUNCTION_CONSTANTS.enrichPersonWithApollo.universalIdentifier,
  name: 'enrich-person-with-apollo',
  description:
    'Look a Person up in Apollo through Composio and write the email and job title it finds as suggestions. Never overwrites Emails or Job Title.',
  timeoutSeconds: 60,
  handler,
  workflowActionTriggerSettings: {
    label: 'Enrich with Apollo',
    icon: 'IconSparkles',
    inputSchema: [
      {
        type: 'object',
        properties: {
          recordId: {
            type: 'record',
            objectUniversalIdentifier:
              STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
            label: 'Person',
          },
        },
      },
    ],
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean', label: 'Success' },
          recordId: { type: 'string', label: 'Record Id' },
          status: { type: 'string', label: 'Status' },
          message: { type: 'string', label: 'Message' },
          data: { type: 'object', label: 'Data' },
        },
      },
    ],
  },
  toolTriggerSettings: {
    inputSchema: {
      type: 'object',
      properties: {
        recordId: {
          type: 'string',
          description: 'The id of the Person record.',
        },
      },
      required: ['recordId'],
      additionalProperties: false,
    },
  },
});
