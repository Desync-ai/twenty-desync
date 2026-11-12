import { CLERK_FORM_SHOWN_STORAGE_KEY } from '@/desync-analytics/constants/ClerkFormShownStorageKey';
import { captureFunnelEvent } from '@/desync-analytics/utils/captureFunnelEvent';

// Fires signup_started when the embedded Clerk form is shown (Clerk's SignIn
// also handles sign-up), once per tab until the next Clerk sign-in. The sessionStorage
// marker survives Clerk's OAuth (e.g. Google) full-page redirect so
// captureClerkAuthCompleted can tell a fresh sign-in from a silent re-exchange
// of an existing Clerk session.
export const captureClerkFormShown = (): void => {
  try {
    if (sessionStorage.getItem(CLERK_FORM_SHOWN_STORAGE_KEY) !== null) {
      return;
    }
    sessionStorage.setItem(CLERK_FORM_SHOWN_STORAGE_KEY, String(Date.now()));
  } catch {
    return;
  }

  captureFunnelEvent('signup_started');
};
