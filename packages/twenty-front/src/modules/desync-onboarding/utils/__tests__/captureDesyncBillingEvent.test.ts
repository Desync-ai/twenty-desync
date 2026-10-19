import {
  captureDesyncBillingEvent,
  getStripeErrorReasonCode,
} from '@/desync-onboarding/utils/captureDesyncBillingEvent';

type WindowWithPostHog = Window & { posthog?: { capture?: jest.Mock } };

const windowWithPostHog = window as WindowWithPostHog;

describe('captureDesyncBillingEvent', () => {
  afterEach(() => {
    delete windowWithPostHog.posthog;
  });

  it('should send the event with its properties immediately', () => {
    const capture = jest.fn();
    windowWithPostHog.posthog = { capture };

    captureDesyncBillingEvent('checkout_failed', {
      plan: 'starter',
      cadence: 'annual',
      surface: 'paywall',
      step: 'card_confirm',
      reason_code: 'insufficient_funds',
    });

    expect(capture).toHaveBeenCalledWith(
      'checkout_failed',
      {
        plan: 'starter',
        cadence: 'annual',
        surface: 'paywall',
        step: 'card_confirm',
        reason_code: 'insufficient_funds',
      },
      { send_instantly: true },
    );
  });

  it('should drop unknown properties and replace free text with a code', () => {
    const capture = jest.fn();
    windowWithPostHog.posthog = { capture };

    captureDesyncBillingEvent('checkout_failed', {
      plan: 'starter',
      cadence: 'monthly',
      surface: 'settings',
      step: 'create',
      reason_code: 'Your card was declined for someone@example.com',
      email: 'someone@example.com',
    } as Parameters<typeof captureDesyncBillingEvent<'checkout_failed'>>[1]);

    const [, properties] = capture.mock.calls[0];

    expect(properties).toEqual({
      plan: 'starter',
      cadence: 'monthly',
      surface: 'settings',
      step: 'create',
      reason_code: 'unknown',
    });
  });

  it('should do nothing when PostHog is not loaded', () => {
    expect(() =>
      captureDesyncBillingEvent('paywall_viewed', { surface: 'paywall' }),
    ).not.toThrow();
  });

  it('should never throw when PostHog throws', () => {
    windowWithPostHog.posthog = {
      capture: jest.fn(() => {
        throw new Error('blocked');
      }),
    };

    expect(() =>
      captureDesyncBillingEvent('paywall_viewed', { surface: 'paywall' }),
    ).not.toThrow();
  });
});

describe('getStripeErrorReasonCode', () => {
  it('should prefer the decline code, then the error code, then the type', () => {
    expect(
      getStripeErrorReasonCode({
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
      }),
    ).toBe('insufficient_funds');
    expect(
      getStripeErrorReasonCode({ type: 'card_error', code: 'expired_card' }),
    ).toBe('expired_card');
    expect(getStripeErrorReasonCode({ type: 'api_error' })).toBe('api_error');
    expect(getStripeErrorReasonCode(undefined)).toBe('unknown');
  });
});
