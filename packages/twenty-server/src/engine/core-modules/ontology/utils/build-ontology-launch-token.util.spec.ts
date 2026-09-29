import { createHmac } from 'crypto';

import { buildOntologyLaunchToken } from './build-ontology-launch-token.util';

// Contract test vector, computed independently with the Python stdlib. Both
// sides of the SSO contract must reproduce this byte for byte.
const TEST_VECTOR_SECRET_B64_URL =
  'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const TEST_VECTOR_EXPECTED_TOKEN =
  'eyJ2IjoxLCJhdWQiOiJvbnRvbG9neS1jb25zb2xlIiwiZW1haWwiOiJhQGV4YW1wbGUuY29tIiwic3ViIjoidTEiLCJ3cyI6IncxIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDAwNjAsIm5vbmNlIjoiQUFBQUFBQUFBQUFBQUFBQUFBQUFBQSJ9.HZi7QEcw1gHV8w8G9ZT5ypZ0jyo-k8yFn5T6WRfy-aI';

const decodePayload = (token: string): Record<string, unknown> => {
  const [payloadSegment] = token.split('.');

  return JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf-8'));
};

describe('buildOntologyLaunchToken', () => {
  it('reproduces the SSO contract test vector byte for byte', () => {
    const token = buildOntologyLaunchToken({
      email: 'a@example.com',
      userId: 'u1',
      workspaceId: 'w1',
      secretB64Url: TEST_VECTOR_SECRET_B64_URL,
      now: 1700000000,
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
    });

    expect(token).toBe(TEST_VECTOR_EXPECTED_TOKEN);
  });

  it('sets exp to iat + 60', () => {
    const now = 1700000000;

    const token = buildOntologyLaunchToken({
      email: 'a@example.com',
      userId: 'u1',
      workspaceId: 'w1',
      secretB64Url: TEST_VECTOR_SECRET_B64_URL,
      now,
    });

    const payload = decodePayload(token);

    expect(payload.iat).toBe(now);
    expect(payload.exp).toBe(now + 60);
  });

  it('lowercases the email', () => {
    const token = buildOntologyLaunchToken({
      email: 'A@Example.COM',
      userId: 'u1',
      workspaceId: 'w1',
      secretB64Url: TEST_VECTOR_SECRET_B64_URL,
      now: 1700000000,
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
    });

    expect(decodePayload(token).email).toBe('a@example.com');
  });

  it('carries v, aud, sub and ws through unchanged', () => {
    const token = buildOntologyLaunchToken({
      email: 'a@example.com',
      userId: 'user-42',
      workspaceId: 'workspace-7',
      secretB64Url: TEST_VECTOR_SECRET_B64_URL,
      now: 1700000000,
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
    });

    const payload = decodePayload(token);

    expect(payload).toMatchObject({
      v: 1,
      aud: 'ontology-console',
      sub: 'user-42',
      ws: 'workspace-7',
    });
  });

  it('uses a fresh nonce on each call', () => {
    const build = () =>
      buildOntologyLaunchToken({
        email: 'a@example.com',
        userId: 'u1',
        workspaceId: 'w1',
        secretB64Url: TEST_VECTOR_SECRET_B64_URL,
      });

    const tokenA = build();
    const tokenB = build();

    expect(tokenA).not.toBe(tokenB);
    expect(decodePayload(tokenA).nonce).not.toBe(decodePayload(tokenB).nonce);
  });

  it('changes the signature if the payload is signed differently than sent (HMAC-input mutant check)', () => {
    // Guards the "HMAC is over the ASCII of the first segment exactly as
    // sent" rule: signing over the re-serialised JSON string instead of the
    // base64url segment must NOT reproduce the vector.
    const payloadJson = JSON.stringify({
      v: 1,
      aud: 'ontology-console',
      email: 'a@example.com',
      sub: 'u1',
      ws: 'w1',
      iat: 1700000000,
      exp: 1700000060,
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
    });
    const secretBytes = Buffer.from(TEST_VECTOR_SECRET_B64_URL, 'base64url');
    const wrongSignature = createHmac('sha256', secretBytes)
      .update(payloadJson) // BUG: signing the raw JSON, not the b64u segment
      .digest('base64url');

    expect(TEST_VECTOR_EXPECTED_TOKEN.endsWith(wrongSignature)).toBe(false);
  });
});
