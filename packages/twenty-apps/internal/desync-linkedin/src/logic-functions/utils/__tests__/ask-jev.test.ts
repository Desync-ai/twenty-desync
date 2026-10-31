import { describe, expect, it, vi } from 'vitest';

import { createAskJev } from 'src/logic-functions/utils/ask-jev';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const spec = { state: { person: { name: 'Ana' } }, questions: {} };

describe('createAskJev', () => {
  it('pins the model and returns the answers', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        json(200, {
          answers: { person: { type: 'noul', noul: 0.9 } },
          model: 'jev-1.13.0',
        }),
      );

    const reply = await createAskJev({ apiKey: 'k', fetchImplementation })(
      spec,
    );

    expect(reply.answers.person).toEqual({ type: 'noul', noul: 0.9 });
    expect(JSON.parse(fetchImplementation.mock.calls[0][1].body).model).toBe(
      'jev-1.13.0',
    );
  });

  it('never repeats the key in an error', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        json(401, { message: 'key secret-key-123 is not valid' }),
      );

    await expect(
      createAskJev({ apiKey: 'secret-key-123', fetchImplementation })(spec),
    ).rejects.toThrow('Jev: HTTP 401: key [key] is not valid');
  });
});
