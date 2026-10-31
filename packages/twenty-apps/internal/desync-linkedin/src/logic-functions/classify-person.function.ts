import {
  defineLogicFunction,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_LOGIC_FUNCTION_CONSTANTS } from 'src/constants/universal-identifiers';
import { classifyPersonCore } from 'src/logic-functions/handlers/classify-person';

const handler = (input: { recordId: string }) => classifyPersonCore({ input });

export default defineLogicFunction({
  universalIdentifier:
    DESYNC_LOGIC_FUNCTION_CONSTANTS.classifyPerson.universalIdentifier,
  name: 'classify-person',
  description:
    'Read a Person with TypeSafe Jev: one real person or not, and whether they fit the ICP rubric. Writes Lead kind, Lead score and Classified at.',
  timeoutSeconds: 60,
  handler,
  workflowActionTriggerSettings: {
    label: 'Classify lead',
    icon: 'IconTarget',
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
