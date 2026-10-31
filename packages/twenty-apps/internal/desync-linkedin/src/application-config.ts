import { defineApplication, FieldType } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Desync LinkedIn',
  description:
    'Classify the people the Desync extension saves from LinkedIn, enrich them with Apollo and send them to Instantly.',
  category: 'Enrichment',
  author: 'Desync',
  // Desync's own keys, set once on the server: the extension never holds them.
  serverVariables: {
    TYPESAFE_API_KEY: {
      description: 'TypeSafe API key for the Jev classifier.',
      isSecret: true,
      isRequired: false,
    },
    TYPESAFE_MODEL: {
      description: 'Pinned Jev model; empty means jev-1.13.0.',
      isSecret: false,
      isRequired: false,
    },
    COMPOSIO_API_KEY: {
      description: 'Composio platform API key, sent as x-api-key.',
      isSecret: true,
      isRequired: false,
    },
  },
  // Each workspace sets its own.
  applicationVariables: {
    ICP_RUBRIC: {
      universalIdentifier: '3156254a-9733-4c95-a9fa-29c8342f9d87',
      label: 'Ideal customer',
      description:
        'Who this workspace sells to, in plain words. Without it, classification only tells people from pages.',
      type: FieldType.TEXT,
      isSecret: false,
      value: '',
    },
    COMPOSIO_USER_ID: {
      universalIdentifier: 'a81f01aa-e044-40fd-9b29-ce3336e871b9',
      label: 'Composio user',
      description:
        'The Composio user id whose Apollo and Instantly connections these functions use (in Desync CRM, the Twenty user id that connected them).',
      type: FieldType.TEXT,
      isSecret: false,
      value: '',
    },
    INSTANTLY_CAMPAIGN_ID: {
      universalIdentifier: 'a1f7303f-4275-447a-9d73-ac893686e914',
      label: 'Instantly campaign',
      description: 'The campaign "Send to Instantly" adds people to.',
      type: FieldType.TEXT,
      isSecret: false,
      value: '',
    },
  },
});
