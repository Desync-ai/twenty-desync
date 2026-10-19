import {
  dismissPlanCountdownForToday,
  isPlanCountdownDismissedToday,
  toLocalDayKey,
} from '@/desync-onboarding/utils/planCountdownDismissal';

describe('planCountdownDismissal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('should format the local calendar day', () => {
    expect(toLocalDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('should not be dismissed by default', () => {
    expect(isPlanCountdownDismissedToday(new Date(2026, 9, 10, 9))).toBe(false);
  });

  it('should stay dismissed for the rest of the same day', () => {
    dismissPlanCountdownForToday(new Date(2026, 9, 10, 9));

    expect(isPlanCountdownDismissedToday(new Date(2026, 9, 10, 23, 59))).toBe(
      true,
    );
  });

  it('should come back the next day', () => {
    dismissPlanCountdownForToday(new Date(2026, 9, 10, 23, 59));

    expect(isPlanCountdownDismissedToday(new Date(2026, 9, 11, 0, 1))).toBe(
      false,
    );
  });
});
