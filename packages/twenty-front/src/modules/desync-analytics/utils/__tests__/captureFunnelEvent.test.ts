import { captureFunnelEvent } from '@/desync-analytics/utils/captureFunnelEvent';

type WindowWithPostHog = Window & { posthog?: { capture?: jest.Mock } };

describe('captureFunnelEvent', () => {
  const windowWithPostHog = window as WindowWithPostHog;

  afterEach(() => {
    delete windowWithPostHog.posthog;
  });

  it('sends the event and its properties to PostHog', () => {
    const capture = jest.fn();
    windowWithPostHog.posthog = { capture };

    captureFunnelEvent('workspace_activated', { duration_ms: 1234 });

    expect(capture).toHaveBeenCalledWith('workspace_activated', {
      duration_ms: 1234,
    });
  });

  it('sends events without properties as an empty object', () => {
    const capture = jest.fn();
    windowWithPostHog.posthog = { capture };

    captureFunnelEvent('signup_started');

    expect(capture).toHaveBeenCalledWith('signup_started', {});
  });

  it('drops non-primitive property values', () => {
    const capture = jest.fn();
    windowWithPostHog.posthog = { capture };

    captureFunnelEvent('workspace_create_clicked', {
      has_logo: true,
      // Simulates a caller bypassing the types with an object.
      ...({ user: { email: 'someone@example.com' } } as object),
    } as { has_logo: boolean });

    expect(capture).toHaveBeenCalledWith('workspace_create_clicked', {
      has_logo: true,
    });
  });

  it('is a no-op when PostHog is not initialised', () => {
    expect(() => captureFunnelEvent('email_sync_skipped')).not.toThrow();
  });

  it('swallows PostHog client errors', () => {
    windowWithPostHog.posthog = {
      capture: jest.fn(() => {
        throw new Error('blocked');
      }),
    };

    expect(() => captureFunnelEvent('clerk_auth_completed')).not.toThrow();
  });
});
