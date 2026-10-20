// Desync: remember, per workspace and per browser, that the user dismissed the
// "Connect your email to fill your CRM" nudge, so it never comes back once
// closed.
//
// Storage is best-effort on purpose: if localStorage is unavailable we treat
// the nudge as dismissed, so a user who can't persist the choice is never
// shown a card they can't get rid of.

const storageKey = (workspaceId: string): string =>
  `desync:connect-email-nudge-dismissed:${workspaceId}`;

export const isConnectEmailNudgeDismissed = (
  workspaceId: string | undefined,
): boolean => {
  if (!workspaceId) {
    return true; // no workspace yet → nothing to nudge about
  }
  try {
    return window.localStorage.getItem(storageKey(workspaceId)) === '1';
  } catch {
    return true; // storage blocked → behave as dismissed
  }
};

export const dismissConnectEmailNudge = (
  workspaceId: string | undefined,
): void => {
  if (!workspaceId) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(workspaceId), '1');
  } catch {
    // ignore — the card is still hidden for this session
  }
};
