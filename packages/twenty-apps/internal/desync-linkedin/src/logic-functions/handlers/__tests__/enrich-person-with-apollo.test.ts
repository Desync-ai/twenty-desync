import { type CoreApiClient } from 'twenty-client-sdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { enrichPersonWithApolloCore } from 'src/logic-functions/handlers/enrich-person-with-apollo';

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
            emails: { primaryEmail: 'ana@personal.com' },
            jobTitle: 'Partnerships',
            linkedinLink: {
              primaryLinkUrl: 'https://www.linkedin.com/in/ana-example',
            },
            company: {
              name: 'Acme Robotics',
              domainName: { primaryLinkUrl: 'https://www.acme.com' },
            },
          },
        },
      ],
    },
  });

  return { client: { query, mutation } as unknown as CoreApiClient, mutation };
};

describe('enrichPersonWithApolloCore', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('writes suggestions, never the Emails or Job Title fields', async () => {
    const { client, mutation } = fakeClient();
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        person: { email: 'ana@acme.com', title: 'Head of Partnerships' },
      },
    });

    const result = await enrichPersonWithApolloCore({
      input: { recordId: 'p-1' },
      client,
      executeTool,
      now: NOW,
    });

    expect(result.status).toBe('MATCHED');
    expect(executeTool).toHaveBeenCalledWith('APOLLO_PEOPLE_ENRICHMENT', {
      linkedin_url: 'https://www.linkedin.com/in/ana-example',
      first_name: 'Ana',
      last_name: 'Example',
      organization_name: 'Acme Robotics',
      domain: 'acme.com',
    });
    const data = mutation.mock.calls[0][0].updatePerson.__args.data;
    expect(data).toEqual({
      desyncEnrichmentStatus: 'MATCHED',
      desyncEnrichedAt: '2026-10-31T00:00:00.000Z',
      desyncSuggestedEmail: 'ana@acme.com',
      desyncSuggestedJobTitle: 'Head of Partnerships',
    });
    expect(data).not.toHaveProperty('emails');
    expect(data).not.toHaveProperty('jobTitle');
  });

  it('marks an error and says why', async () => {
    const { client, mutation } = fakeClient();
    const executeTool = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'No connected account' });

    const result = await enrichPersonWithApolloCore({
      input: { recordId: 'p-1' },
      client,
      executeTool,
      now: NOW,
    });

    expect(result).toMatchObject({
      success: false,
      status: 'ERROR',
      message: 'No connected account',
    });
    expect(
      mutation.mock.calls[0][0].updatePerson.__args.data.desyncEnrichmentStatus,
    ).toBe('ERROR');
  });

  it('does nothing without Composio settings', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    const { client, mutation } = fakeClient();

    const result = await enrichPersonWithApolloCore({
      input: { recordId: 'p-1' },
      client,
    });

    expect(result.status).toBe('NOT_CONFIGURED');
    expect(mutation).not.toHaveBeenCalled();
  });
});
