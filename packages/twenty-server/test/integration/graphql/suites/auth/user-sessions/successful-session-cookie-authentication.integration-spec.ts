import {
  extractSessionCookie,
  hasClearingCookie,
  postMetadataOperationWithHeaders,
  signInWithCookieCapture,
} from 'test/integration/graphql/suites/auth/user-sessions/utils/sign-in-with-cookie-capture.util';
import { currentUserIdentityQueryFactory } from 'test/integration/graphql/suites/auth/user-sessions/utils/user-session-operations.util';

import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';

import { ALLOWED_ORIGIN } from 'test/integration/graphql/suites/auth/user-sessions/constants/session-origins.constants';

describe('successful session cookie authentication (integration)', () => {
  let sessionCookieHeader: string;

  beforeAll(async () => {
    const signInResponse = await signInWithCookieCapture({
      originHeader: ALLOWED_ORIGIN,
    });
    const sessionCookie = extractSessionCookie(signInResponse);

    if (!sessionCookie) {
      throw new Error('Expected a session cookie from sign-in');
    }

    sessionCookieHeader = sessionCookie.cookieHeader;
  });

  it('should authenticate a request carrying only the session cookie', async () => {
    const response = await postMetadataOperationWithHeaders(
      currentUserIdentityQueryFactory(),
      {
        originHeader: ALLOWED_ORIGIN,
        cookieHeader: sessionCookieHeader,
      },
    );

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.currentUser).toMatchObject({
      id: USER_DATA_SEED_IDS.TIM,
      email: 'tim@apple.dev',
    });
  });

  // A page that signs in over its live session (e.g. /verify?loginToken=…)
  // still has requests in flight carrying the old cookie. Rejecting them
  // logged the user out, and the clearing cookie on their responses wiped the
  // session that had just replaced it.
  it('should keep authenticating a just-superseded session cookie without clearing the cookie', async () => {
    const replacingSignInResponse = await signInWithCookieCapture({
      originHeader: ALLOWED_ORIGIN,
      cookieHeader: sessionCookieHeader,
    });

    expect(extractSessionCookie(replacingSignInResponse)).toBeDefined();

    const stragglerResponse = await postMetadataOperationWithHeaders(
      currentUserIdentityQueryFactory(),
      {
        originHeader: ALLOWED_ORIGIN,
        cookieHeader: sessionCookieHeader,
      },
    );

    expect(stragglerResponse.body.errors).toBeUndefined();
    expect(stragglerResponse.body.data.currentUser).toMatchObject({
      id: USER_DATA_SEED_IDS.TIM,
    });
    expect(hasClearingCookie(stragglerResponse)).toBe(false);
  });
});
