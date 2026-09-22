import { clerkSignOutState } from '@/auth/states/clerkSignOutState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useClerk } from '@clerk/clerk-react';
import { useEffect } from 'react';

// Rendered only inside ClerkProvider (ClerkAuthProvider's enabled branch), where
// useClerk() is always safe. It publishes Clerk's signOut into a Jotai atom so
// useLogout can reach it without ever calling a Clerk hook itself — those hooks
// throw when Clerk is disabled and no ClerkProvider is mounted.
export const ClerkSignOutRegistrar = () => {
  const { signOut } = useClerk();
  const setClerkSignOut = useSetAtomState(clerkSignOutState);

  useEffect(() => {
    // The no-op callback makes Clerk clear its session WITHOUT running its own
    // post-sign-out redirect, so Twenty's signOut keeps ownership of the final
    // navigation to the sign-in page.
    setClerkSignOut({ signOut: () => signOut(() => {}) });

    return () => {
      setClerkSignOut({ signOut: null });
    };
  }, [signOut, setClerkSignOut]);

  return null;
};
