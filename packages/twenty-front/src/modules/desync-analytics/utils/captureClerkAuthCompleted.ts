import { CLERK_FORM_SHOWN_STORAGE_KEY } from '@/desync-analytics/constants/ClerkFormShownStorageKey';
import { captureFunnelEvent } from '@/desync-analytics/utils/captureFunnelEvent';

// Fires clerk_auth_completed when a Clerk session exists and the Clerk form was
// shown earlier in this tab session (see captureClerkFormShown). Users who
// arrive with an existing Clerk session never saw the form, so they are not
// counted. Clears the marker so it fires once.
export const captureClerkAuthCompleted = (): void => {
  try {
    if (sessionStorage.getItem(CLERK_FORM_SHOWN_STORAGE_KEY) === null) {
      return;
    }
    sessionStorage.removeItem(CLERK_FORM_SHOWN_STORAGE_KEY);
  } catch {
    return;
  }

  captureFunnelEvent('clerk_auth_completed');
};
