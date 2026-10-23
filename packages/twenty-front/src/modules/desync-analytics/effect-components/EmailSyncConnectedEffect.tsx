import { useEffect, useRef } from 'react';

import { currentUserState } from '@/auth/states/currentUserState';
import { captureFunnelEvent } from '@/desync-analytics/utils/captureFunnelEvent';
import { consumeEmailSyncPendingConnection } from '@/desync-analytics/utils/consumeEmailSyncPendingConnection';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';
import { OnboardingStatus } from '~/generated-metadata/graphql';

// Back from the onboarding email-sync OAuth round trip: the server completes
// the SYNC_EMAIL step before redirecting on success, so if the user has moved
// past it the connection worked. Evaluated once per page load, after the user
// is loaded; the marker is cleared either way.
export const EmailSyncConnectedEffect = () => {
  const currentUser = useAtomStateValue(currentUserState);
  // oxlint-disable-next-line twenty/no-state-useref
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current || !isDefined(currentUser?.onboardingStatus)) {
      return;
    }
    hasCheckedRef.current = true;

    const provider = consumeEmailSyncPendingConnection();

    if (
      isDefined(provider) &&
      currentUser.onboardingStatus !== OnboardingStatus.SYNC_EMAIL
    ) {
      captureFunnelEvent('email_sync_connected', { provider });
    }
  }, [currentUser?.onboardingStatus]);

  return null;
};
