import { PENDING_EMAIL_SYNC_STORAGE_KEY } from '@/desync-analytics/constants/PendingEmailSyncStorageKey';
import { type EmailSyncProvider } from '@/desync-analytics/types/EmailSyncProvider';

// The email-sync OAuth flow leaves the app, so the onboarding step cannot see
// whether it succeeded. Remember that a connection was started; the next app
// load decides (PostHogFunnelEffect + consumeEmailSyncPendingConnection).
export const markEmailSyncConnectionStarted = (
  provider: EmailSyncProvider,
): void => {
  try {
    localStorage.setItem(
      PENDING_EMAIL_SYNC_STORAGE_KEY,
      JSON.stringify({ provider, startedAt: Date.now() }),
    );
  } catch {
    // Best-effort.
  }
};
