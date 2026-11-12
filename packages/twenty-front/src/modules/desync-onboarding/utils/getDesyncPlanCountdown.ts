// Desync: "N days left on your plan" countdown for plans that END rather than
// renew: a Referral trial, a complimentary grant, or any other row that was not
// provisioned from a Stripe subscription. When such a plan runs out the CRM is
// replaced by the paywall, so we warn from DESYNC_PLAN_COUNTDOWN_DAYS before
// the period end and point to Plan & Billing.
//
// Never shown to Stripe-backed plans (own subscription or a seat a teammate pays
// for: they renew), Admin or internal accounts, or when the end date or the
// Stripe backing is unknown (a seat holder must never be told to buy a plan).

export const DESYNC_PLAN_COUNTDOWN_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DesyncPlanCountdownSubscription = {
  hasSubscription: boolean;
  planLevel: string | null;
  current: boolean;
  periodEnd: number | null; // epoch seconds
  stripeActive: boolean;
  stripeBacked?: boolean | null;
  isInternal: boolean;
};

// The current plan ends at periodEnd with no renewal behind it.
export const isDesyncNonRenewingPlan = (
  sub: DesyncPlanCountdownSubscription,
): boolean =>
  !sub.isInternal &&
  sub.planLevel !== 'Admin' &&
  sub.hasSubscription &&
  sub.current &&
  !sub.stripeActive &&
  sub.stripeBacked === false &&
  sub.periodEnd != null;

// Whole days left (rounded up, so the last 24 hours read "1 day"), or null when
// no countdown should show.
export const getDesyncPlanDaysLeft = (
  sub: DesyncPlanCountdownSubscription | undefined,
  nowMs: number,
): number | null => {
  if (sub === undefined || !isDesyncNonRenewingPlan(sub)) {
    return null;
  }

  const msLeft = (sub.periodEnd as number) * 1000 - nowMs;

  // Already over: the entitlement gate shows the paywall instead.
  if (!Number.isFinite(msLeft) || msLeft <= 0) {
    return null;
  }

  const daysLeft = Math.ceil(msLeft / DAY_MS);

  return daysLeft <= DESYNC_PLAN_COUNTDOWN_DAYS ? daysLeft : null;
};
