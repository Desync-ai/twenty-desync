import { useAuth } from '@/auth/hooks/useAuth';
import { clerkSignOutState } from '@/auth/states/clerkSignOutState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

// Full sign-out across both identity layers. Twenty's own signOut only clears
// the Twenty session (the httpOnly cookie + isCookieAuthActiveState). When Clerk
// is the identity provider the user would stay signed into Clerk, and
// SignInUpClerkExchangeEffect (which fires on isSignedIn && !isLogged) would
// immediately re-exchange and log them straight back in. So we sign out of Clerk
// first — flipping Clerk's isSignedIn to false — then sign out of Twenty.
//
// The Clerk handle is read from an atom populated by ClerkSignOutRegistrar,
// which is mounted only inside ClerkProvider. This hook therefore never calls a
// Clerk hook, so it stays safe when Clerk is disabled and no ClerkProvider is
// mounted (the handle is simply null and skipped).
export const useLogout = () => {
  const { signOut: signOutFromTwenty } = useAuth();
  const { signOut: clerkSignOut } = useAtomStateValue(clerkSignOutState);
  const setPendingServerSignOut = useSetAtomState(isPendingServerSignOutState);

  const logout = useCallback(async () => {
    // Mark sign-out pending up front so SignInUpClerkExchangeEffect stands down
    // through the whole logout (incl. the async Clerk sign-out) and can't
    // re-exchange us straight back in. Cleared on the next active session.
    setPendingServerSignOut(true);

    // Clear the PostHog identity so post-logout events aren't tied to this user.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).posthog?.reset?.();

    if (isDefined(clerkSignOut)) {
      try {
        await clerkSignOut();
      } catch {
        // Never let a Clerk failure strand the user half-signed-out: fall
        // through and clear the Twenty session regardless.
      }
    }

    await signOutFromTwenty();
  }, [clerkSignOut, signOutFromTwenty, setPendingServerSignOut]);

  return { logout };
};
