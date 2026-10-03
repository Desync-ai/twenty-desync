import { useQuery } from '@apollo/client/react';
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { DesyncPaywall } from '@/desync-onboarding/components/DesyncPaywall';
import { MY_ENTITLEMENT_QUERY } from '@/desync-onboarding/graphql/desyncBilling';
import { UserOrMetadataLoader } from '~/loading/components/UserOrMetadataLoader';

// Desync: block the CRM when the user has no active subscription_usage row (an
// expired Referral or never-paid). Their workspace is preserved; they see the
// paywall, pay, and `myEntitlement` flips true → back into the SAME workspace.
//
// FAILS CLOSED: if the check errors (data undefined) we treat the user as NOT
// entitled and show the paywall — matching the backend EntitlementService, which
// also fails closed. The paywall itself is always reachable (it does not require
// entitlement), so a blocked user can always pay.
export const DesyncEntitlementGate = () => {
  const { data, loading, startPolling, stopPolling } = useQuery(
    MY_ENTITLEMENT_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );

  const entitled = data?.myEntitlement?.entitled === true;

  // While NOT entitled (e.g. the user just paid and the Stripe webhook hasn't
  // provisioned the subscription_usage row yet), keep re-checking so the CRM
  // unlocks on its own the moment the row lands — no manual refresh needed, even
  // if provisioning takes longer than the checkout form's own poll window. Stop
  // once entitled so entitled users don't poll needlessly.
  useEffect(() => {
    if (!entitled) {
      startPolling(5000);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [entitled, startPolling, stopPolling]);

  if (loading && data === undefined) {
    return <UserOrMetadataLoader />;
  }

  if (!entitled) {
    return <DesyncPaywall />;
  }

  return <Outlet />;
};
