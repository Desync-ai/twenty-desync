// Desync: remember, per workspace and per browser, which Playbooks the user has
// started and which play they last had open. Two jobs:
//   1. Guide them step by step: the "next step" nudge advances off a play once it
//      has been started, pointing at the next logical play.
//   2. Survive the connect/OAuth round-trip: when a user opens a play and connects
//      an integration (which redirects away and back), the same play reopens.
//
// Best-effort, exactly like getStartedSeen: if localStorage is unavailable
// (private mode, blocked site data) we degrade to "no progress" (every play looks
// un-started, nothing auto-reopens) and never throw.

const startedKey = (workspaceId: string): string =>
  `desync:playbooks-started:${workspaceId}`;

const lastOpenKey = (workspaceId: string): string =>
  `desync:playbooks-last-open:${workspaceId}`;

export const getStartedPlaybooks = (
  workspaceId: string | undefined,
): Set<string> => {
  if (!workspaceId) {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(startedKey(workspaceId));
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((key): key is string => typeof key === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
};

export const markPlaybookStarted = (
  workspaceId: string | undefined,
  key: string,
): void => {
  if (!workspaceId) {
    return;
  }
  try {
    const started = getStartedPlaybooks(workspaceId);
    started.add(key);
    window.localStorage.setItem(
      startedKey(workspaceId),
      JSON.stringify([...started]),
    );
  } catch {
    // ignore — worst case the "next step" nudge doesn't advance
  }
};

export const getLastOpenPlaybook = (
  workspaceId: string | undefined,
): string | null => {
  if (!workspaceId) {
    return null;
  }
  try {
    return window.localStorage.getItem(lastOpenKey(workspaceId));
  } catch {
    return null;
  }
};

export const setLastOpenPlaybook = (
  workspaceId: string | undefined,
  key: string | null,
): void => {
  if (!workspaceId) {
    return;
  }
  try {
    if (key === null) {
      window.localStorage.removeItem(lastOpenKey(workspaceId));
    } else {
      window.localStorage.setItem(lastOpenKey(workspaceId), key);
    }
  } catch {
    // ignore — worst case the open play doesn't survive a connect round-trip
  }
};
