import { captureClerkAuthCompleted } from '@/desync-analytics/utils/captureClerkAuthCompleted';
import { captureClerkFormShown } from '@/desync-analytics/utils/captureClerkFormShown';

type WindowWithPostHog = Window & { posthog?: { capture?: jest.Mock } };

describe('captureClerkFormShown / captureClerkAuthCompleted', () => {
  const windowWithPostHog = window as WindowWithPostHog;
  let capture: jest.Mock;

  beforeEach(() => {
    sessionStorage.clear();
    capture = jest.fn();
    windowWithPostHog.posthog = { capture };
  });

  afterEach(() => {
    delete windowWithPostHog.posthog;
  });

  it('fires signup_started once until the user signs in', () => {
    captureClerkFormShown();
    captureClerkFormShown();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('signup_started', {});
  });

  it('fires clerk_auth_completed once after the form was shown', () => {
    captureClerkFormShown();
    captureClerkAuthCompleted();
    captureClerkAuthCompleted();

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith('clerk_auth_completed', {});
  });

  it('ignores an existing Clerk session that never showed the form', () => {
    captureClerkAuthCompleted();

    expect(capture).not.toHaveBeenCalled();
  });
});
