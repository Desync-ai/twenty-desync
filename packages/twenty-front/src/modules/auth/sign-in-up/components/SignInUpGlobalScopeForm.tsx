import { availableWorkspacesState } from '@/auth/states/availableWorkspacesState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { useBuildWorkspaceUrl } from '@/domain-manager/hooks/useBuildWorkspaceUrl';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { FormProvider } from 'react-hook-form';
import {
  ClickToActionLink,
  UndecoratedLink,
} from 'twenty-ui/primitives/navigation';

import { StyledOnboardingContentContainer } from '@/auth/components/StyledOnboardingContentContainer';
import { OnboardingStepAnimatedItem } from '@/onboarding/components/OnboardingStepAnimatedItem';
import { SignInUpWithClerk } from '@/auth/sign-in-up/components/internal/SignInUpWithClerk';
import { SignInUpWithCredentials } from '@/auth/sign-in-up/components/internal/SignInUpWithCredentials';
import { SignInUpWithGoogle } from '@/auth/sign-in-up/components/internal/SignInUpWithGoogle';
import { SignInUpWithMicrosoft } from '@/auth/sign-in-up/components/internal/SignInUpWithMicrosoft';
import { useHandleResetPassword } from '@/auth/sign-in-up/hooks/useHandleResetPassword';
import { useSignInUpForm } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { ACCEPT_WORKSPACE_INVITATION_FOR_CURRENT_USER } from '@/auth/graphql/mutations/acceptWorkspaceInvitationForCurrentUser';
import { getAvailableWorkspacePathAndSearchParams } from '@/auth/utils/availableWorkspacesUtils';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { authProvidersState } from '@/client-config/states/authProvidersState';
import { clerkConfigState } from '@/client-config/states/clerkConfigState';
import { isDDLLockedState } from '@/client-config/states/isDDLLockedState';
import { DEFAULT_WORKSPACE_LOGO } from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isNonEmptyString } from '@sniptt/guards';
import { useContext, useState } from 'react';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { IconChevronRight, IconPlus } from 'twenty-ui/icon';
import { HorizontalSeparator } from 'twenty-ui/primitives/layout';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import {
  type AvailableWorkspace,
  GetWorkspaceCreationDefaultsDocument,
} from '~/generated-metadata/graphql';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

const StyledWorkspaceContainer = styled.div`
  background-color: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;

  > * {
    border-bottom: 1px solid ${themeCssVariables.border.color.medium};

    &:last-child {
      border-bottom: none;
    }
  }
`;

const StyledWorkspaceItem = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  height: ${themeCssVariables.spacing[15]};
  justify-content: space-between;
  overflow: hidden;

  padding: 0;
  width: 100%;

  &:hover {
    background-color: ${themeCssVariables.background.transparent.light};
  }

  &:last-child {
    border-bottom: none;
  }
`;

const StyledWorkspaceContent = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  padding: 0 ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledWorkspaceTextContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

const StyledWorkspaceLogo = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  height: ${themeCssVariables.spacing[6]};
  justify-content: center;
  width: ${themeCssVariables.spacing[6]};
`;

const StyledWorkspaceName = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledWorkspaceUrl = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledChevronIcon = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
`;

const StyledForgotPasswordLinkContainer = styled.div`
  display: flex;
  justify-content: center;
  padding-top: ${themeCssVariables.spacing[4]};
`;

export const SignInUpGlobalScopeForm = () => {
  const { theme } = useContext(ThemeContext);
  const authProviders = useAtomStateValue(authProvidersState);
  const clerkConfig = useAtomStateValue(clerkConfigState);
  const isDDLLocked = useAtomStateValue(isDDLLockedState);
  const signInUpStep = useAtomStateValue(signInUpStepState);
  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const { buildWorkspaceUrl } = useBuildWorkspaceUrl();
  const availableWorkspaces = useAtomStateValue(availableWorkspacesState);
  const { t } = useLingui();

  const { form } = useSignInUpForm();
  const { handleResetPassword } = useHandleResetPassword();
  const returnToPath = useAtomStateValue(returnToPathState);

  // Desync: accept a pending invite from the central domain (app.*), then hand
  // the user into the workspace via a login token — see the mutation doc.
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();
  const { enqueueToast } = useToast();
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [acceptWorkspaceInvitation] = useMutation(
    ACCEPT_WORKSPACE_INVITATION_FOR_CURRENT_USER,
  );

  const handleAcceptInvite = async (availableWorkspace: AvailableWorkspace) => {
    if (
      isAcceptingInvite ||
      !isNonEmptyString(availableWorkspace.personalInviteToken)
    ) {
      return;
    }

    setIsAcceptingInvite(true);

    try {
      const { data } = await acceptWorkspaceInvitation({
        variables: {
          personalInviteToken: availableWorkspace.personalInviteToken,
        },
      });

      const result = data?.acceptWorkspaceInvitationForCurrentUser;

      if (!isDefined(result?.loginToken)) {
        throw new Error('Could not accept the invitation. Please try again.');
      }

      await redirectToWorkspaceDomain(
        getWorkspaceUrl(availableWorkspace.workspaceUrls),
        AppPath.Verify,
        { loginToken: result.loginToken },
        '_self',
      );
    } catch (error: unknown) {
      setIsAcceptingInvite(false);
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  useQuery(GetWorkspaceCreationDefaultsDocument, {
    skip: signInUpStep !== SignInUpStep.WorkspaceSelection,
  });

  const getAvailableWorkspaceUrl = (availableWorkspace: AvailableWorkspace) => {
    const { pathname, searchParams } = getAvailableWorkspacePathAndSearchParams(
      availableWorkspace,
      { email: form.getValues('email') },
    );

    return buildWorkspaceUrl(
      getWorkspaceUrl(availableWorkspace.workspaceUrls),
      pathname,
      {
        ...searchParams,
        ...(isNonEmptyString(returnToPath) ? { returnToPath } : {}),
      },
    );
  };

  const availableWorkspacesList = [
    ...availableWorkspaces.availableWorkspacesForSignIn,
    ...availableWorkspaces.availableWorkspacesForSignUp,
  ];

  return (
    <>
      {signInUpStep === SignInUpStep.WorkspaceSelection && (
        <StyledOnboardingContentContainer>
          <StyledWorkspaceContainer>
            {availableWorkspacesList.map((availableWorkspace, index) => {
              // Desync: a pending INVITE (no loginToken, has inviteHash) is
              // accepted server-side from app.* on click, then the user is handed
              // into the workspace via /verify — rather than navigating to the
              // workspace subdomain, where the Clerk session may not have carried.
              // Members (loginToken present) keep the normal link.
              const isInvite =
                !isDefined(availableWorkspace.loginToken) &&
                isNonEmptyString(availableWorkspace.personalInviteToken);

              const workspaceRow = (
                <StyledWorkspaceItem
                  {...(isInvite
                    ? { onClick: () => handleAcceptInvite(availableWorkspace) }
                    : {})}
                >
                  <StyledWorkspaceContent>
                    <Avatar
                      name={availableWorkspace.displayName || ''}
                      src={getAbsoluteImageUrl(
                        availableWorkspace.logo ?? DEFAULT_WORKSPACE_LOGO,
                      )}
                      size="lg"
                    />
                    <StyledWorkspaceTextContainer>
                      <StyledWorkspaceName>
                        {availableWorkspace.displayName ||
                          availableWorkspace.id}
                      </StyledWorkspaceName>
                      <StyledWorkspaceUrl>
                        {
                          new URL(
                            getWorkspaceUrl(availableWorkspace.workspaceUrls),
                          ).hostname
                        }
                      </StyledWorkspaceUrl>
                    </StyledWorkspaceTextContainer>
                    <StyledChevronIcon>
                      <IconChevronRight size={theme.icon.size.md} />
                    </StyledChevronIcon>
                  </StyledWorkspaceContent>
                </StyledWorkspaceItem>
              );

              return (
                <OnboardingStepAnimatedItem
                  key={availableWorkspace.id}
                  index={index}
                >
                  {isInvite ? (
                    workspaceRow
                  ) : (
                    <UndecoratedLink
                      to={getAvailableWorkspaceUrl(availableWorkspace)}
                    >
                      {workspaceRow}
                    </UndecoratedLink>
                  )}
                </OnboardingStepAnimatedItem>
              );
            })}
            {!isDDLLocked && (
              <OnboardingStepAnimatedItem
                index={availableWorkspacesList.length}
              >
                <StyledWorkspaceItem
                  onClick={() =>
                    setSignInUpStep(SignInUpStep.WorkspaceCreation)
                  }
                >
                  <StyledWorkspaceContent>
                    <StyledWorkspaceLogo>
                      <IconPlus size={theme.icon.size.lg} />
                    </StyledWorkspaceLogo>
                    <StyledWorkspaceTextContainer>
                      <StyledWorkspaceName>{t`Create a workspace`}</StyledWorkspaceName>
                    </StyledWorkspaceTextContainer>
                    <StyledChevronIcon>
                      <IconChevronRight size={theme.icon.size.md} />
                    </StyledChevronIcon>
                  </StyledWorkspaceContent>
                </StyledWorkspaceItem>
              </OnboardingStepAnimatedItem>
            )}
          </StyledWorkspaceContainer>
        </StyledOnboardingContentContainer>
      )}
      {signInUpStep !== SignInUpStep.WorkspaceSelection && (
        <StyledOnboardingContentContainer>
          {clerkConfig.isEnabled && <SignInUpWithClerk />}
          {!clerkConfig.isEnabled && (
            <>
              {authProviders.google && (
                <SignInUpWithGoogle
                  action="list-available-workspaces"
                  isGlobalScope
                />
              )}
              {authProviders.microsoft && (
                <SignInUpWithMicrosoft
                  action="list-available-workspaces"
                  isGlobalScope
                />
              )}
              {(authProviders.google || authProviders.microsoft) && (
                <HorizontalSeparator
                  color={themeCssVariables.background.transparent.light}
                />
              )}
              {/* oxlint-disable-next-line react/jsx-props-no-spreading */}
              <FormProvider {...form}>
                <SignInUpWithCredentials isGlobalScope />
              </FormProvider>
              {signInUpStep === SignInUpStep.Password && (
                <StyledForgotPasswordLinkContainer>
                  <ClickToActionLink
                    onClick={handleResetPassword(form.getValues('email'))}
                  >
                    <Trans>Forgot your password?</Trans>
                  </ClickToActionLink>
                </StyledForgotPasswordLinkContainer>
              )}
            </>
          )}
        </StyledOnboardingContentContainer>
      )}
    </>
  );
};
