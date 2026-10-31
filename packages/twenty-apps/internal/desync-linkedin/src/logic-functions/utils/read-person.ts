import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type PersonNode } from 'src/types/person-node';

export const readPerson = async ({
  client,
  recordId,
}: {
  client: CoreApiClient;
  recordId: string;
}): Promise<(PersonNode & { desyncSuggestedEmail?: string | null }) | null> => {
  const result = (await client.query({
    people: {
      __args: { filter: { id: { eq: recordId } }, first: 1 },
      edges: {
        node: {
          id: true,
          name: { firstName: true, lastName: true },
          emails: { primaryEmail: true },
          jobTitle: true,
          city: true,
          linkedinLink: { primaryLinkUrl: true },
          company: { name: true, domainName: { primaryLinkUrl: true } },
          desyncSuggestedEmail: true,
        },
      },
    },
  })) as {
    people?: {
      edges?: { node: PersonNode & { desyncSuggestedEmail?: string | null } }[];
    };
  };

  return result.people?.edges?.[0]?.node ?? null;
};
