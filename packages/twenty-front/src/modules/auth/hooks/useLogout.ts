import { useAuth } from '@/auth/hooks/useAuth';
import { clerkSignOutState } from '@/auth/states/clerkSignOutState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
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

  const logout = useCallback(async () => {
    if (isDefined(clerkSignOut)) {
      try {
        await clerkSignOut();
      } catch {
        // Never let a Clerk failure strand the user half-signed-out: fall
        // through and clear the Twenty session regardless.
      }
    }

    await signOutFromTwenty();
  }, [clerkSignOut, signOutFromTwenty]);

  return { logout };
};
