import { type PropsWithChildren } from 'react';

import { ClerkSignOutRegistrar } from '@/auth/components/ClerkSignOutRegistrar';
import { SignInUpClerkExchangeEffect } from '@/auth/sign-in-up/components/internal/SignInUpClerkExchangeEffect';
import { clerkConfigState } from '@/client-config/states/clerkConfigState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ClerkProvider } from '@clerk/clerk-react';
import { isNonEmptyString } from '@sniptt/guards';

// Mounts Clerk only when the runtime client-config both enables it and provides
// a publishable key. Before the client-config has loaded, or when Clerk is
// disabled, it renders children untouched so the app boots normally and the
// existing email/password + Google/Microsoft/SSO flows keep working.
export const ClerkAuthProvider = ({ children }: PropsWithChildren) => {
  const clerkConfig = useAtomStateValue(clerkConfigState);

  if (
    !clerkConfig.isEnabled ||
    !isNonEmptyString(clerkConfig.publishableKey)
  ) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={clerkConfig.publishableKey}>
      <ClerkSignOutRegistrar />
      <SignInUpClerkExchangeEffect />
      {children}
    </ClerkProvider>
  );
};
