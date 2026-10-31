import { type CoreApiClient } from 'twenty-client-sdk/core';

export const updatePerson = async ({
  client,
  recordId,
  data,
}: {
  client: CoreApiClient;
  recordId: string;
  data: Record<string, unknown>;
}): Promise<void> => {
  await client.mutation({
    updatePerson: { __args: { id: recordId, data }, id: true },
  });
};
