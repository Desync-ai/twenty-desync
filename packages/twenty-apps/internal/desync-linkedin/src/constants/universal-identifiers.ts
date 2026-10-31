export const APPLICATION_UNIVERSAL_IDENTIFIER =
  'bcf97afa-6c2f-4edc-9c6f-ec82adaabe32';

export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '386fbc99-14a8-457a-9586-8c7afdf3488b';

export const DESYNC_LOGIC_FUNCTION_CONSTANTS = {
  classifyPerson: {
    universalIdentifier: 'ac9599e8-e209-4827-acc1-184ee21f68bc',
  },
  enrichPersonWithApollo: {
    universalIdentifier: '1ea4807d-57d1-4e6d-8cb1-8470cc5a5fda',
  },
  sendPersonToInstantly: {
    universalIdentifier: 'fcbf2f95-5aab-4de2-ba44-c4867ef664ef',
  },
} as const;

export const DESYNC_FIELD_UNIVERSAL_IDENTIFIERS = {
  person: {
    desyncLeadKind: '55712169-230e-47e2-b1f2-18ebc3099d80',
    desyncLeadScore: 'e5b13fa4-7a59-400b-b457-d5325fa01ad7',
    desyncClassifiedAt: 'ea8018b0-fb26-47ed-b646-b749d69d9d44',
    desyncEnrichmentStatus: '3cff905e-6316-40b4-bb96-290dd5578583',
    desyncSuggestedEmail: '4752bfb9-a414-4d05-90e3-77e7b8849a2b',
    desyncSuggestedJobTitle: '24c261f0-5361-4af1-98b2-83f3772449fa',
    desyncEnrichedAt: '126f6e00-0a1b-4d1a-b343-ded9716c9b53',
    desyncSentToInstantlyAt: '7683accc-fe85-4b33-9dd5-c36c4b24572b',
  },
} as const;

export const DESYNC_SELECT_OPTION_UNIVERSAL_IDENTIFIERS = {
  leadKind: {
    icp: '381864e9-086f-4f28-b380-09c4b8a200ad',
    person: '9198f3ce-def8-4f85-8a26-9f9bdc269c2c',
    notAPerson: '1dac0ae1-9f55-4ced-8d8d-cd0fbd4e88f1',
    undecided: '78642661-fab7-4f76-a6a5-f5191346e29c',
  },
  enrichmentStatus: {
    matched: '68c87b36-315d-425e-bbfd-fbc4bd217d42',
    notFound: 'd36d61d6-c2d7-46f5-9e2a-cf398007053a',
    error: '493a3c9c-9c0e-4d67-937d-069912a9c508',
  },
} as const;
