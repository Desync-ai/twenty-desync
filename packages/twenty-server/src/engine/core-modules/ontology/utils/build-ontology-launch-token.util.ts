import { createHmac, randomBytes } from 'crypto';

// SSO contract v1 (Twenty -> Ontology console). Keep this file's behaviour in
// exact lockstep with the console's verifier: same key order, same encoding,
// same TTL. See the launch-token test vector for the byte-exact pin.
const ONTOLOGY_LAUNCH_TOKEN_VERSION = 1;
const ONTOLOGY_LAUNCH_TOKEN_AUDIENCE = 'ontology-console';
const ONTOLOGY_LAUNCH_TOKEN_TTL_SECONDS = 60;
const ONTOLOGY_LAUNCH_TOKEN_NONCE_BYTES = 16;

type OntologyLaunchTokenPayload = {
  v: typeof ONTOLOGY_LAUNCH_TOKEN_VERSION;
  aud: typeof ONTOLOGY_LAUNCH_TOKEN_AUDIENCE;
  email: string;
  sub: string;
  ws: string;
  iat: number;
  exp: number;
  nonce: string;
};

const base64UrlEncode = (input: Buffer | string): string =>
  (Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8')).toString(
    'base64url',
  );

type BuildOntologyLaunchTokenParams = {
  email: string;
  userId: string;
  workspaceId: string;
  secretB64Url: string;
  // Overridable only for deterministic tests; production callers rely on the
  // defaults (current time, a fresh random nonce per call).
  now?: number;
  nonce?: string;
};

export const buildOntologyLaunchToken = ({
  email,
  userId,
  workspaceId,
  secretB64Url,
  now = Math.floor(Date.now() / 1000),
  nonce = base64UrlEncode(randomBytes(ONTOLOGY_LAUNCH_TOKEN_NONCE_BYTES)),
}: BuildOntologyLaunchTokenParams): string => {
  // Key order matters: the HMAC is computed over this exact JSON string, and
  // the console verifies it over the received bytes, never re-serialised
  // JSON, so key order here must match the contract precisely.
  const payload: OntologyLaunchTokenPayload = {
    v: ONTOLOGY_LAUNCH_TOKEN_VERSION,
    aud: ONTOLOGY_LAUNCH_TOKEN_AUDIENCE,
    email: email.toLowerCase(),
    sub: userId,
    ws: workspaceId,
    iat: now,
    exp: now + ONTOLOGY_LAUNCH_TOKEN_TTL_SECONDS,
    nonce,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const secretBytes = Buffer.from(secretB64Url, 'base64url');
  const signatureSegment = base64UrlEncode(
    createHmac('sha256', secretBytes).update(payloadSegment).digest(),
  );

  return `${payloadSegment}.${signatureSegment}`;
};
