import { type CoreApiClient } from 'twenty-client-sdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyPersonCore } from 'src/logic-functions/handlers/classify-person';

const NOW = () => new Date('2026-10-31T00:00:00.000Z');

const fakeClient = () => {
  const mutation = vi.fn().mockResolvedValue({});
  const query = vi.fn().mockResolvedValue({
    people: {
      edges: [
        {
          node: {
            id: 'p-1',
            name: { firstName: 'Ana', lastName: 'Example' },
            jobTitle: 'CTO',
          },
        },
      ],
    },
  });

  return { client: { query, mutation } as unknown as CoreApiClient, mutation };
};

describe('classifyPersonCore', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('asks about the ICP when the rubric is set and writes the decision', async () => {
    vi.stubEnv('ICP_RUBRIC', 'Technical founders of robotics startups');
    const { client, mutation } = fakeClient();
    const askJev = vi.fn().mockResolvedValue({
      model: 'jev-1.13.0',
      answers: {
        person: { type: 'noul', noul: 0.97 },
        icp: { type: 'noul', noul: 0.9 },
      },
    });

    const result = await classifyPersonCore({
      input: { recordId: 'p-1' },
      client,
      askJev,
      now: NOW,
    });

    expect(Object.keys(askJev.mock.calls[0][0].questions)).toEqual([
      'person',
      'icp',
    ]);
    expect(result).toMatchObject({ success: true, status: 'ICP' });
    expect(mutation.mock.calls[0][0].updatePerson.__args.data).toEqual({
      desyncLeadKind: 'ICP',
      desyncLeadScore: 0.9,
      desyncClassifiedAt: '2026-10-31T00:00:00.000Z',
    });
  });

  it('writes nothing when Jev fails', async () => {
    const { client, mutation } = fakeClient();
    const askJev = vi.fn().mockRejectedValue(new Error('Jev: HTTP 503'));

    await expect(
      classifyPersonCore({ input: { recordId: 'p-1' }, client, askJev }),
    ).rejects.toThrow('503');
    expect(mutation).not.toHaveBeenCalled();
  });
});
