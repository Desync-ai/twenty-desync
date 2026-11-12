import { PENDING_EMAIL_SYNC_STORAGE_KEY } from '@/desync-analytics/constants/PendingEmailSyncStorageKey';
import { type EmailSyncProvider } from '@/desync-analytics/types/EmailSyncProvider';

// An OAuth round trip older than this is treated as abandoned.
const PENDING_EMAIL_SYNC_MAX_AGE_MS = 30 * 60 * 1000;

// Returns the provider of a fresh pending email-sync connection, if any, and
// always clears the marker so it is evaluated at most once.
export const consumeEmailSyncPendingConnection = ():
  | EmailSyncProvider
  | undefined => {
  try {
    const rawValue = localStorage.getItem(PENDING_EMAIL_SYNC_STORAGE_KEY);

    if (rawValue === null) {
      return undefined;
    }
    localStorage.removeItem(PENDING_EMAIL_SYNC_STORAGE_KEY);

    const pendingConnection = JSON.parse(rawValue) as {
      provider?: unknown;
      startedAt?: unknown;
    };
    const isFresh =
      typeof pendingConnection.startedAt === 'number' &&
      Date.now() - pendingConnection.startedAt <= PENDING_EMAIL_SYNC_MAX_AGE_MS;

    return isFresh &&
      (pendingConnection.provider === 'google' ||
        pendingConnection.provider === 'microsoft')
      ? pendingConnection.provider
      : undefined;
  } catch {
    return undefined;
  }
};
