// Desync: remember, per workspace and per browser, whether the user has already
// been shown the guided "Get started" page. We use this to land a user on
// /get-started exactly once — the first time they enter a workspace — and never
// hijack their normal landing afterwards.
//
// Storage is best-effort on purpose: if localStorage is unavailable (private
// mode, blocked site data) we treat the page as already seen, so we never risk
// forcing the redirect repeatedly. The worst case of a lost flag is that a
// returning user sees the (harmless, helpful) Get-started page one extra time.

const storageKey = (workspaceId: string): string =>
  `desync:get-started-seen:${workspaceId}`;

export const hasSeenGetStarted = (workspaceId: string | undefined): boolean => {
  if (!workspaceId) {
    return true; // no workspace yet → nothing to land on, don't force
  }
  try {
    return window.localStorage.getItem(storageKey(workspaceId)) === '1';
  } catch {
    return true; // storage blocked → behave as "seen" so we never loop
  }
};

export const markGetStartedSeen = (workspaceId: string | undefined): void => {
  if (!workspaceId) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(workspaceId), '1');
  } catch {
    // ignore — worst case we show Get-started again on the next entry
  }
};
