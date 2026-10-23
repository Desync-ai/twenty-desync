import { isDefined } from 'twenty-shared/utils';

// Desync: PostHog events for the billing funnel (paywall → plan → checkout →
// activation). PostHog is loaded by the index.html snippet as window.posthog and
// only inits on the CRM hosts, so this is a no-op elsewhere (localhost, tests,
// blocked by an ad blocker). The twenty-front repo is public and PostHog is a
// third party: properties are an allowlist of enum-like values only (plan key,
// cadence, Stripe error codes), never emails, names, card data or free text.

export type DesyncBillingSurface = 'paywall' | 'settings';

export type DesyncBillingCadence = 'monthly' | 'annual';

export type DesyncCheckoutStep =
  | 'create'
  | 'card_confirm'
  | 'activate'
  | 'finalize';

export type DesyncBillingPlanStatus =
  | 'internal'
  | 'no_plan'
  | 'expired'
  | 'cancels_soon'
  | 'active';

type DesyncCheckoutProperties = {
  plan: string;
  cadence: DesyncBillingCadence;
  surface: DesyncBillingSurface;
};

type DesyncBillingEventProperties = {
  paywall_viewed: { surface: DesyncBillingSurface };
  billing_page_viewed: {
    surface: DesyncBillingSurface;
    plan_status: DesyncBillingPlanStatus;
    is_paid_plan: boolean;
  };
  plan_selected: DesyncCheckoutProperties;
  checkout_submitted: DesyncCheckoutProperties;
  checkout_failed: DesyncCheckoutProperties & {
    step: DesyncCheckoutStep;
    reason_code: string;
  };
  subscription_activated: DesyncCheckoutProperties;
};

export type DesyncBillingEventName = keyof DesyncBillingEventProperties;

const ALLOWED_PROPERTY_KEYS = new Set([
  'surface',
  'plan_status',
  'is_paid_plan',
  'plan',
  'cadence',
  'step',
  'reason_code',
]);

// Stripe codes and plan keys are snake_case identifiers; anything else (e.g. a
// human-readable error message slipping in) is replaced so it never leaves the
// browser.
const SAFE_CODE_PATTERN = /^[a-z0-9_-]{1,64}$/i;

export const UNKNOWN_BILLING_REASON_CODE = 'unknown';

const sanitizeBillingEventProperties = (
  properties: Record<string, unknown>,
): Record<string, string | boolean> =>
  Object.entries(properties).reduce<Record<string, string | boolean>>(
    (sanitized, [key, value]) => {
      if (!ALLOWED_PROPERTY_KEYS.has(key)) {
        return sanitized;
      }
      if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (typeof value === 'string') {
        sanitized[key] = SAFE_CODE_PATTERN.test(value)
          ? value
          : UNKNOWN_BILLING_REASON_CODE;
      }
      return sanitized;
    },
    {},
  );

type PostHogCaptureClient = {
  capture?: (
    event: string,
    properties?: Record<string, unknown>,
    options?: { send_instantly?: boolean },
  ) => void;
};

export const captureDesyncBillingEvent = <
  TEventName extends DesyncBillingEventName,
>(
  eventName: TEventName,
  properties: DesyncBillingEventProperties[TEventName],
) => {
  const posthog = (window as unknown as { posthog?: PostHogCaptureClient })
    .posthog;

  if (!isDefined(posthog) || typeof posthog.capture !== 'function') {
    return;
  }

  try {
    // send_instantly: activation is followed by a full page reload, which can
    // drop a batched event.
    posthog.capture(eventName, sanitizeBillingEventProperties(properties), {
      send_instantly: true,
    });
  } catch {
    // Analytics must never break checkout.
  }
};

type StripeErrorLike = {
  type?: string;
  code?: string;
  decline_code?: string;
};

// Most specific Stripe code first: decline_code (e.g. insufficient_funds) only
// exists for card_declined. Never the error message, which can echo user input.
export const getStripeErrorReasonCode = (
  error: StripeErrorLike | undefined,
): string =>
  error?.decline_code ??
  error?.code ??
  error?.type ??
  UNKNOWN_BILLING_REASON_CODE;
