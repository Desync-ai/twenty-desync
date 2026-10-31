import {
  defineLogicFunction,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_LOGIC_FUNCTION_CONSTANTS } from 'src/constants/universal-identifiers';
import { sendPersonToInstantlyCore } from 'src/logic-functions/handlers/send-person-to-instantly';

const handler = (input: { recordId: string; campaignId?: string }) =>
  sendPersonToInstantlyCore({ input });

export default defineLogicFunction({
  universalIdentifier:
    DESYNC_LOGIC_FUNCTION_CONSTANTS.sendPersonToInstantly.universalIdentifier,
  name: 'send-person-to-instantly',
  description:
    'Add a Person to an Instantly campaign through Composio, with their email (or the email Apollo suggested).',
  timeoutSeconds: 60,
  handler,
  workflowActionTriggerSettings: {
    label: 'Send to Instantly',
    icon: 'IconSend',
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
          campaignId: {
            type: 'string',
            label: 'Instantly campaign id (empty: the app setting)',
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
        campaignId: {
          type: 'string',
          description: 'Instantly campaign id; omit to use the app setting.',
        },
      },
      required: ['recordId'],
      additionalProperties: false,
    },
  },
});
