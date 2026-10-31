import { describe, expect, it, vi } from 'vitest';

import { executeComposioTool } from 'src/logic-functions/utils/execute-composio-tool';

const respond = (status: number, body: unknown) =>
  vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );

describe('executeComposioTool', () => {
  it('posts the user and arguments with the key in x-api-key', async () => {
    const fetchImplementation = respond(200, {
      data: { person: {} },
      successful: true,
    });

    const result = await executeComposioTool({
      apiKey: 'ak_test',
      userId: 'user-1',
      toolSlug: 'APOLLO_PEOPLE_ENRICHMENT',
      toolArguments: { linkedin_url: 'https://www.linkedin.com/in/ana' },
      fetchImplementation,
    });

    expect(result).toEqual({ ok: true, data: { person: {} } });
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe(
      'https://backend.composio.dev/api/v3/tools/execute/APOLLO_PEOPLE_ENRICHMENT',
    );
    expect(init.headers['x-api-key']).toBe('ak_test');
    expect(JSON.parse(init.body)).toEqual({
      user_id: 'user-1',
      arguments: { linkedin_url: 'https://www.linkedin.com/in/ana' },
    });
  });

  it.each([
    [
      'an error field',
      200,
      { error: 'No connected account', successful: false },
      'No connected account',
    ],
    ['a failed status', 401, { message: 'bad key' }, '"bad key"'],
    [
      'successful: false',
      200,
      { data: {}, successful: false },
      'APOLLO_PEOPLE_ENRICHMENT did not succeed.',
    ],
  ])('fails on %s', async (_case, status, body, error) => {
    const result = await executeComposioTool({
      apiKey: 'ak_test',
      userId: 'user-1',
      toolSlug: 'APOLLO_PEOPLE_ENRICHMENT',
      toolArguments: {},
      fetchImplementation: respond(status, body),
    });

    expect(result).toEqual({ ok: false, error });
  });
});
