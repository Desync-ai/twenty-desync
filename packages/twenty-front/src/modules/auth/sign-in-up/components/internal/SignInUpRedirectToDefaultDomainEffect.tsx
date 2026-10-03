import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { useWorkspaceFromInviteHash } from '@/auth/sign-in-up/hooks/useWorkspaceFromInviteHash';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useIsCurrentLocationOnDefaultDomain } from '@/domain-manager/hooks/useIsCurrentLocationOnDefaultDomain';
import { useRedirectToDefaultDomain } from '@/domain-manager/hooks/useRedirectToDefaultDomain';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

// A logged-out visitor who lands on a WORKSPACE subdomain's sign-in page (e.g. a
// co-founder shared desync.twenty.desync.ai) is funneled to the central
// app.<domain>/welcome, so they create/choose their OWN workspace instead of
// trying to sign into a workspace they don't belong to and getting denied.
//
// Only mounted when Clerk is enabled (so useClerkAuth is safe). Guards — we
// redirect ONLY when every one holds, so a legitimate flow is never interrupted:
//   - multi-workspace mode is on, and we are NOT already on the default domain
//     (redirectToDefaultDomain also no-ops on the default domain, a second guard)
//   - client config has loaded and Clerk has loaded (state is meaningful)
//   - there is NO invite hash (an invited user is MEANT to join THIS workspace)
//   - the user is not already logged into Twenty, and NOT signed into Clerk — a
//     member re-establishing an expired Twenty session on their own workspace
//     subdomain has isSignedIn=true and must be left to exchange in place
//   - there is no loginToken in the URL (the /verify cookie handoff)
export const SignInUpRedirectToDefaultDomainEffect = () => {
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
  const clientConfigApiStatus = useAtomStateValue(clientConfigApiStatusState);
  const { isDefaultDomain } = useIsCurrentLocationOnDefaultDomain();
  const { workspaceInviteHash } = useWorkspaceFromInviteHash();
  const isLogged = useIsLogged();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { redirectToDefaultDomain } = useRedirectToDefaultDomain();

  useEffect(() => {
    if (
      !clientConfigApiStatus.isLoadedOnce ||
      isLoaded !== true ||
      !isMultiWorkspaceEnabled ||
      isDefaultDomain ||
      isDefined(workspaceInviteHash) ||
      isLogged ||
      isSignedIn === true ||
      isDefined(new URLSearchParams(window.location.search).get('loginToken'))
    ) {
      return;
    }

    redirectToDefaultDomain({ pathname: AppPath.SignInUp });
  }, [
    clientConfigApiStatus.isLoadedOnce,
    isLoaded,
    isMultiWorkspaceEnabled,
    isDefaultDomain,
    workspaceInviteHash,
    isLogged,
    isSignedIn,
    redirectToDefaultDomain,
  ]);

  return null;
};
