import {
  DESYNC_PLAN_COUNTDOWN_DAYS,
  type DesyncPlanCountdownSubscription,
  getDesyncPlanDaysLeft,
  isDesyncNonRenewingPlan,
} from '@/desync-onboarding/utils/getDesyncPlanCountdown';

const NOW_MS = Date.UTC(2026, 9, 10, 12, 0, 0);
const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

const endingIn = (seconds: number): number => NOW_MS / 1000 + seconds;

const buildSub = (
  overrides: Partial<DesyncPlanCountdownSubscription> = {},
): DesyncPlanCountdownSubscription => ({
  hasSubscription: true,
  planLevel: 'Referral',
  current: true,
  periodEnd: endingIn(3 * DAY_S),
  stripeActive: false,
  stripeBacked: false,
  isInternal: false,
  ...overrides,
});

describe('getDesyncPlanDaysLeft', () => {
  it('should count down a free trial inside the window', () => {
    expect(getDesyncPlanDaysLeft(buildSub(), NOW_MS)).toBe(3);
  });

  it('should count down a paid-level plan with no Stripe subscription (complimentary grant)', () => {
    expect(
      getDesyncPlanDaysLeft(buildSub({ planLevel: 'Starter' }), NOW_MS),
    ).toBe(3);
  });

  it('should start exactly at the threshold and not before', () => {
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ periodEnd: endingIn(DESYNC_PLAN_COUNTDOWN_DAYS * DAY_S) }),
        NOW_MS,
      ),
    ).toBe(DESYNC_PLAN_COUNTDOWN_DAYS);
    expect(
      getDesyncPlanDaysLeft(
        buildSub({
          periodEnd: endingIn(DESYNC_PLAN_COUNTDOWN_DAYS * DAY_S + 1),
        }),
        NOW_MS,
      ),
    ).toBeNull();
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ periodEnd: endingIn(14 * DAY_S) }),
        NOW_MS,
      ),
    ).toBeNull();
  });

  it('should round partial days up so the last day reads 1', () => {
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ periodEnd: endingIn(2 * HOUR_S) }),
        NOW_MS,
      ),
    ).toBe(1);
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ periodEnd: endingIn(DAY_S + HOUR_S) }),
        NOW_MS,
      ),
    ).toBe(2);
  });

  it('should hide once the period has ended', () => {
    expect(
      getDesyncPlanDaysLeft(buildSub({ periodEnd: endingIn(0) }), NOW_MS),
    ).toBeNull();
    expect(
      getDesyncPlanDaysLeft(buildSub({ periodEnd: endingIn(-DAY_S) }), NOW_MS),
    ).toBeNull();
  });

  it('should hide for a live Stripe subscription', () => {
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ planLevel: 'Starter', stripeActive: true }),
        NOW_MS,
      ),
    ).toBeNull();
  });

  it('should hide for a Stripe-backed row such as a seat paid by a teammate', () => {
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ planLevel: 'Crusader', stripeBacked: true }),
        NOW_MS,
      ),
    ).toBeNull();
  });

  it('should hide for Admin and internal accounts', () => {
    expect(
      getDesyncPlanDaysLeft(buildSub({ planLevel: 'Admin' }), NOW_MS),
    ).toBeNull();
    expect(
      getDesyncPlanDaysLeft(buildSub({ isInternal: true }), NOW_MS),
    ).toBeNull();
  });

  it('should hide when the end date or subscription is missing', () => {
    expect(
      getDesyncPlanDaysLeft(buildSub({ periodEnd: null }), NOW_MS),
    ).toBeNull();
    expect(
      getDesyncPlanDaysLeft(
        buildSub({ hasSubscription: false, planLevel: null }),
        NOW_MS,
      ),
    ).toBeNull();
    expect(getDesyncPlanDaysLeft(undefined, NOW_MS)).toBeNull();
  });

  it('should hide when the row is not current', () => {
    expect(
      getDesyncPlanDaysLeft(buildSub({ current: false }), NOW_MS),
    ).toBeNull();
  });

  it('should hide when the Stripe backing is unknown', () => {
    expect(
      getDesyncPlanDaysLeft(buildSub({ stripeBacked: undefined }), NOW_MS),
    ).toBeNull();
    expect(
      getDesyncPlanDaysLeft(buildSub({ stripeBacked: null }), NOW_MS),
    ).toBeNull();
  });
});

describe('isDesyncNonRenewingPlan', () => {
  it('should be true for a current plan with an end date and no Stripe subscription', () => {
    expect(isDesyncNonRenewingPlan(buildSub({ planLevel: 'Starter' }))).toBe(
      true,
    );
  });

  it('should be false for a Stripe-subscribed plan', () => {
    expect(
      isDesyncNonRenewingPlan(
        buildSub({ planLevel: 'Starter', stripeActive: true }),
      ),
    ).toBe(false);
  });
});
