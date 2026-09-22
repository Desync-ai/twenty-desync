import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { clerkExchangeFailedState } from '@/auth/states/clerkExchangeFailedState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { SignIn, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { MainButton } from 'twenty-ui/components';
import { Loader } from 'twenty-ui/primitives/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledStateContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]} 0;
  width: 100%;
`;

const StyledStatusText = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  text-align: center;
`;

// The onboarding block is a fixed-width (440px) plain block, so Clerk's
// fit-content card renders flush-left and looks off-center. Centering it in a
// flex row pins the card's center to the block's center (and the block is itself
// centered in the modal), regardless of the card's intrinsic width.
const StyledClerkFormContainer = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  width: 100%;
`;

export const SignInUpWithClerk = () => {
  const { t } = useLingui();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const isLogged = useIsLogged();
  const clerkExchangeFailed = useAtomStateValue(clerkExchangeFailedState);
  const setClerkExchangeFailed = useSetAtomState(clerkExchangeFailedState);

  const handleRetry = async () => {
    setClerkExchangeFailed(false);
    // Sign out of Clerk (no redirect) so isSignedIn flips false and the embedded
    // form reappears; the exchange effect then runs cleanly on the next sign-in.
    await signOut(() => {});
  };

  // Clerk SDK is still initializing.
  if (!isLoaded) {
    return (
      <StyledStateContainer>
        <Loader color="gray" />
      </StyledStateContainer>
    );
  }

  // Signed into Clerk: SignInUpClerkExchangeEffect is bridging to a Twenty
  // session. Never show the sign-in form here, or it flashes as if login failed.
  if (isSignedIn) {
    // The exchange failed and no Twenty session was established: offer a retry
    // instead of spinning forever (isSignedIn stays true, isLogged stays false).
    if (clerkExchangeFailed && !isLogged) {
      return (
        <StyledStateContainer>
          <StyledStatusText>
            {t`We couldn't finish signing you in. Please try again.`}
          </StyledStatusText>
          <MainButton onClick={handleRetry} fullWidth>
            {t`Sign in again`}
          </MainButton>
        </StyledStateContainer>
      );
    }

    // Exchange in flight, or the Twenty session just became active and we are
    // about to route into the workspace.
    return (
      <StyledStateContainer>
        <Loader color="gray" />
        <StyledStatusText>{t`Signing you in…`}</StyledStatusText>
      </StyledStateContainer>
    );
  }

  // Not signed into Clerk yet: render the embedded form immediately (no button,
  // no modal). routing="virtual" keeps it in place, and the redirect props are
  // pinned to the current URL so Clerk never navigates on its own —
  // SignInUpClerkExchangeEffect owns the post-sign-in hand-off.
  return (
    <StyledClerkFormContainer>
      <SignIn
        routing="virtual"
        fallbackRedirectUrl={window.location.href}
        forceRedirectUrl={window.location.href}
      />
    </StyledClerkFormContainer>
  );
};
