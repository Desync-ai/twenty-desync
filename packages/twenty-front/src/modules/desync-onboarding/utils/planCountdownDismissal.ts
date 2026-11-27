// Desync: the plan countdown banner can be dismissed for the rest of the day
// (local time); it comes back the next day. Per browser, best-effort: if
// localStorage is unavailable the banner simply shows again.

const STORAGE_KEY = 'desync:plan-countdown-dismissed-day';

export const toLocalDayKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
};

export const isPlanCountdownDismissedToday = (now: Date): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === toLocalDayKey(now);
  } catch {
    return false;
  }
};

export const dismissPlanCountdownForToday = (now: Date): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, toLocalDayKey(now));
  } catch {
    // ignore: worst case the banner shows again on the next page load
  }
};
