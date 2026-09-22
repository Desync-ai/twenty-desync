import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useRedeemClerkToken } from '@/auth/hooks/useRedeemClerkToken';
import { clerkExchangeFailedState } from '@/auth/states/clerkExchangeFailedState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect, useRef } from 'react';
import { isDefined } from 'twenty-shared/utils';

// Bridges a Clerk session into a Twenty session: once Clerk reports a signed-in
// user and no Twenty session cookie is active yet, it exchanges the Clerk JWT
// for Twenty's own session (set server-side as an httpOnly cookie). Mounted
// inside ClerkAuthProvider so it runs on whichever route the unauthenticated
// gate lands on (e.g. /welcome) and self-heals an expired Twenty cookie while
// the Clerk session is still valid.
//
// It also owns the clerkExchangeFailedState flag the sign-in surface reads: a
// fresh attempt clears it, and any terminal failure sets it, so the surface can
// fall back from its "Signing you in…" spinner to a retry instead of spinning
// forever (isSignedIn stays true and isLogged stays false after a failure).
export const SignInUpClerkExchangeEffect = () => {
  const { redeemClerkToken } = useRedeemClerkToken();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const isLogged = useIsLogged();
  const setClerkExchangeFailed = useSetAtomState(clerkExchangeFailedState);
  // A concurrency latch, not render state: prevents a second exchange from
  // firing while the first is still in flight.
  // oxlint-disable-next-line twenty/no-state-useref
  const isExchangingRef = useRef(false);

  useEffect(() => {
    if (
      isLoaded !== true ||
      isSignedIn !== true ||
      isLogged ||
      isExchangingRef.current
    ) {
      return;
    }

    isExchangingRef.current = true;
    // Clear any prior failure so the surface shows the spinner, not the retry
    // fallback, while this fresh attempt is in flight.
    setClerkExchangeFailed(false);

    void (async () => {
      try {
        const clerkToken = await getToken();

        if (!isDefined(clerkToken)) {
          // No token means we cannot exchange: surface the failure so the UI
          // falls back to retry rather than spinning forever.
          setClerkExchangeFailed(true);
          return;
        }

        const succeeded = await redeemClerkToken(clerkToken);

        if (!succeeded) {
          setClerkExchangeFailed(true);
        }
      } catch {
        setClerkExchangeFailed(true);
      } finally {
        isExchangingRef.current = false;
      }
    })();
  }, [
    isLoaded,
    isSignedIn,
    isLogged,
    getToken,
    redeemClerkToken,
    setClerkExchangeFailed,
  ]);

  return <></>;
};
