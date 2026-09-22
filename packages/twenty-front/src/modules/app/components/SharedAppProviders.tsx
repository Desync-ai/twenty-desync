import { type PropsWithChildren } from 'react';

import { ApolloProvider } from '@/apollo/components/ApolloProvider';
import { ClerkAuthProvider } from '@/auth/components/ClerkAuthProvider';
import { PendingServerSignOutEffect } from '@/auth/effect-components/PendingServerSignOutEffect';
import { ClientConfigProvider } from '@/client-config/components/ClientConfigProvider';
import { ClientConfigProviderEffect } from '@/client-config/components/ClientConfigProviderEffect';
import { BaseThemeProvider } from '@/ui/theme/components/BaseThemeProvider';

type SharedAppProvidersProps = PropsWithChildren;

export const SharedAppProviders = ({ children }: SharedAppProvidersProps) => {
  return (
    <ApolloProvider>
      <BaseThemeProvider>
        <ClientConfigProviderEffect />
        <PendingServerSignOutEffect />
        <ClientConfigProvider>
          <ClerkAuthProvider>{children}</ClerkAuthProvider>
        </ClientConfigProvider>
      </BaseThemeProvider>
    </ApolloProvider>
  );
};
