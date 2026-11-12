import { useLogout } from '@/auth/hooks/useLogout';
import { Trans } from '@lingui/react/macro';
import { ClickToActionLink } from 'twenty-ui/primitives/navigation';

export const WorkspaceSelectionFooter = () => {
  // Full sign-out across both identity layers. The raw useAuth().signOut only
  // clears the Twenty session; with Clerk as the IdP the Clerk session survives
  // and SignInUpClerkExchangeEffect re-exchanges it, logging the user straight
  // back in (a logout that just refreshes the workspace-selection page). This is
  // the one workspace-chooser exit for a user with no accessible workspace (e.g.
  // a non-allowlisted email on an enterprise instance), so it must fully sign out.
  const { logout } = useLogout();

  return (
    <ClickToActionLink onClick={logout}>
      <Trans>Log out</Trans>
    </ClickToActionLink>
  );
};
