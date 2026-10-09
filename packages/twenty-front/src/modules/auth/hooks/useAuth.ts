import { gql } from '@apollo/client';
import {
  useApolloClient,
  useLazyQuery,
  useMutation,
} from '@apollo/client/react';
import { useCallback } from 'react';
import { AppPath } from 'twenty-shared/types';

import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  type AuthToken,
  CheckUserExistsDocument,
  GetAuthTokensFromLoginTokenDocument,
  GetAuthTokensFromOtpDocument,
  GetLoginTokenFromCredentialsDocument,
  GetWorkspaceCreationDefaultsDocument,
  SignInDocument,
  SignOutDocument,
  SignUpInWorkspaceDocument,
  SignUpDocument,
  VerifyEmailAndGetLoginTokenDocument,
  VerifyEmailAndGetWorkspaceAgnosticTokenDocument,
} from '~/generated-metadata/graphql';

import { useMarkSessionActive } from '@/auth/hooks/useMarkSessionActive';
import { currentUserState } from '@/auth/states/currentUserState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { clearSessionLocalStorageKeys } from '@/auth/utils/clearSessionLocalStorageKeys';
import { broadcastSignOutToOtherTabs } from '@/auth/utils/crossTabSignOut';
import { clearSessionGeneration } from '@/auth/utils/clearSessionGeneration';
import { isValidReturnToPath } from '@/auth/utils/isValidReturnToPath';
import { isNonEmptyString } from '@sniptt/guards';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { loginTokenState } from '@/auth/states/loginTokenState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { type BillingCheckoutSession } from '@/auth/types/billingCheckoutSession.type';
import {
  countAvailableWorkspaces,
  getFirstAvailableWorkspaces,
} from '@/auth/utils/availableWorkspacesUtils';
import { isEmailVerificationRequiredState } from '@/client-config/states/isEmailVerificationRequiredState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useLastAuthenticatedWorkspaceDomain } from '@/domain-manager/hooks/useLastAuthenticatedWorkspaceDomain';
import { useReadDefaultDomainFromConfiguration } from '@/domain-manager/hooks/useReadDefaultDomainFromConfiguration';
import { useOrigin } from '@/domain-manager/hooks/useOrigin';
import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { i18n } from '@lingui/core';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { isDefined } from 'twenty-shared/utils';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import { useStore } from 'jotai';

// Desync: central-schema (served at /metadata, the default Apollo client) query
// for whether the signup questionnaire is done. Untyped on purpose (no codegen
// dependency in the dev build).
const DESYNC_ONBOARDING_STATUS_QUERY = gql`
  query DesyncOnboardingStatus {
    desyncOnboardingStatus
  }
`;

export const useAuth = () => {
  const store = useStore();
  const markSessionActive = useMarkSessionActive();
  const setLoginToken = useSetAtomState(loginTokenState);
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );

  const { origin } = useOrigin();
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
  const isEmailVerificationRequired = useAtomStateValue(
    isEmailVerificationRequiredState,
  );
  const { loadCurrentUser } = useLoadCurrentUser();
  const apolloClient = useApolloClient();

  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const { redirect } = useRedirect();
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();

  const [getLoginTokenFromCredentials] = useMutation(
    GetLoginTokenFromCredentialsDocument,
  );
  const [signIn] = useMutation(SignInDocument);
  const [signUp] = useMutation(SignUpDocument);
  const [signUpInWorkspace] = useMutation(SignUpInWorkspaceDocument);
  const [getAuthTokensFromLoginToken] = useMutation(
    GetAuthTokensFromLoginTokenDocument,
  );
  const [verifyEmailAndGetLoginToken] = useMutation(
    VerifyEmailAndGetLoginTokenDocument,
  );
  const [verifyEmailAndGetWorkspaceAgnosticToken] = useMutation(
    VerifyEmailAndGetWorkspaceAgnosticTokenDocument,
  );
  const [getAuthTokensFromOtp] = useMutation(GetAuthTokensFromOtpDocument);
  const [signOutMutation] = useMutation(SignOutDocument);

  const workspacePublicData = useAtomStateValue(workspacePublicDataState);

  const { setLastAuthenticateWorkspaceDomain } =
    useLastAuthenticatedWorkspaceDomain();
  const { defaultDomain } = useReadDefaultDomainFromConfiguration();
  const [checkUserExistsQuery, { data: checkUserExistsData }] = useLazyQuery(
    CheckUserExistsDocument,
  );

  const [, setSearchParams] = useSearchParams();

  const navigate = useNavigate();

  const clearSession = useCallback(() => {
    // The assign below is the only navigation: keep the redirect effect from
    // racing it to the sign-in page once the session is cleared.
    store.set(isAppEffectRedirectEnabledState.atom, false);
    sessionStorage.clear();
    store.set(isCookieAuthActiveState.atom, false);
    store.set(currentUserState.atom, null);
    store.set(currentWorkspaceState.atom, null);
    store.set(currentWorkspaceMemberState.atom, null);
    store.set(currentUserWorkspaceState.atom, null);
    clearSessionGeneration();
    clearSessionLocalStorageKeys();
    setLastAuthenticateWorkspaceDomain(null);
    // Land on the central/default subdomain's sign-in (e.g. app.<domain>) rather
    // than the workspace subdomain you signed out of, so logout goes to a neutral
    // login page. Already on the default domain (or single-workspace) → stay local.
    if (
      isMultiWorkspaceEnabled &&
      isNonEmptyString(defaultDomain) &&
      window.location.hostname !== defaultDomain
    ) {
      window.location.assign(`https://${defaultDomain}${AppPath.SignInUp}`);
    } else {
      window.location.assign(AppPath.SignInUp);
    }
  }, [
    store,
    setLastAuthenticateWorkspaceDomain,
    isMultiWorkspaceEnabled,
    defaultDomain,
  ]);

  const navigateAfterMultiWorkspaceSignInUp = useCallback(
    async (
      availableWorkspaces: Parameters<typeof countAvailableWorkspaces>[0],
      email: string,
    ) => {
      // Desync: gate the whole post-signup flow on the questionnaire. Until it's
      // complete, show the questionnaire step (on the central domain) BEFORE any
      // workspace choice/creation. Fails open so a backend blip can't trap the user.
      try {
        const { data } = await apolloClient.query({
          query: DESYNC_ONBOARDING_STATUS_QUERY,
          fetchPolicy: 'network-only',
        });

        if (data?.desyncOnboardingStatus === false) {
          setSignInUpStep(SignInUpStep.DesyncQuestionnaire);
          return;
        }
      } catch {
        // fall through — don't trap the user if the check errors.
      }

      const availableWorkspacesCount =
        countAvailableWorkspaces(availableWorkspaces);

      // The in-app "Create Workspace" entry point redirects here with this
      // signal so an existing user with workspaces lands on the creation form
      // instead of the workspace selection step.
      const wantsToCreateNewWorkspace =
        new URLSearchParams(window.location.search).get('action') ===
        'create-new-workspace';

      if (availableWorkspacesCount === 0 || wantsToCreateNewWorkspace) {
        await apolloClient.query({
          query: GetWorkspaceCreationDefaultsDocument,
        });
        setSignInUpStep(SignInUpStep.WorkspaceCreation);
        return;
      }

      if (availableWorkspacesCount === 1) {
        const targetWorkspace =
          getFirstAvailableWorkspaces(availableWorkspaces);

        // Desync: only auto-redirect into a workspace the user is already a
        // MEMBER of — a membership carries a loginToken, so `/verify` sets the
        // host-only session cookie on that subdomain. A single PENDING INVITE
        // has NO loginToken; auto-redirecting it loops (the user is signed in on
        // app.* but has no session on the workspace subdomain, which bounces back
        // to app.*). For an invite, stay on the central domain and show the
        // explicit choice: accept the invite OR create your own workspace.
        if (isDefined(targetWorkspace.loginToken)) {
          return await redirectToWorkspaceDomain(
            getWorkspaceUrl(targetWorkspace.workspaceUrls),
            AppPath.Verify,
            {
              loginToken: targetWorkspace.loginToken,
              email,
            },
          );
        }

        setSignInUpStep(SignInUpStep.WorkspaceSelection);
        return;
      }

      setSignInUpStep(SignInUpStep.WorkspaceSelection);
    },
    [apolloClient, redirectToWorkspaceDomain, setSignInUpStep],
  );

  // Desync: after the Clerk exchange establishes a workspace-agnostic session on
  // the CENTRAL domain (result.onCentralDomain), load the user and run the step
  // machine (questionnaire → workspace choice) instead of redirecting into a
  // workspace. Mirrors handleverifyEmailAndGetWorkspaceAgnosticToken.
  const handleClerkCentralLanding = useCallback(async () => {
    markSessionActive();

    const { user } = await loadCurrentUser();

    await navigateAfterMultiWorkspaceSignInUp(
      user.availableWorkspaces,
      user.email,
    );
  }, [markSessionActive, loadCurrentUser, navigateAfterMultiWorkspaceSignInUp]);

  const handleGetLoginTokenFromCredentials = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      try {
        const getLoginTokenResult = await getLoginTokenFromCredentials({
          variables: {
            email,
            password,
            captchaToken,
            origin,
          },
        });
        if (isDefined(getLoginTokenResult.error)) {
          throw getLoginTokenResult.error;
        }

        if (!getLoginTokenResult.data?.getLoginTokenFromCredentials) {
          throw new Error('No login token');
        }

        return getLoginTokenResult.data.getLoginTokenFromCredentials;
      } catch (error) {
        if (isGraphqlErrorOfType(error, 'EMAIL_NOT_VERIFIED')) {
          setSearchParams({ email });
          setSignInUpStep(SignInUpStep.EmailVerification);
          throw error;
        }
        throw error;
      }
    },
    [getLoginTokenFromCredentials, setSearchParams, setSignInUpStep, origin],
  );

  const handleverifyEmailAndGetLoginToken = useCallback(
    async (
      emailVerificationToken: string,
      email: string,
      captchaToken?: string,
    ) => {
      const loginTokenResult = await verifyEmailAndGetLoginToken({
        variables: {
          email,
          emailVerificationToken,
          captchaToken,
          origin,
        },
      });

      if (isDefined(loginTokenResult.error)) {
        throw loginTokenResult.error;
      }

      if (!loginTokenResult.data?.verifyEmailAndGetLoginToken) {
        throw new Error('No login token');
      }

      return loginTokenResult.data.verifyEmailAndGetLoginToken;
    },
    [verifyEmailAndGetLoginToken, origin],
  );

  const handleverifyEmailAndGetWorkspaceAgnosticToken = useCallback(
    async (
      emailVerificationToken: string,
      email: string,
      captchaToken?: string,
    ) => {
      const { data, error } = await verifyEmailAndGetWorkspaceAgnosticToken({
        variables: {
          email,
          emailVerificationToken,
          captchaToken,
        },
      });

      if (isDefined(error)) {
        throw error;
      }

      if (!data?.verifyEmailAndGetWorkspaceAgnosticToken) {
        throw new Error('No workspace agnostic token in result');
      }

      markSessionActive();

      const { user } = await loadCurrentUser();

      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
      );
    },
    [
      verifyEmailAndGetWorkspaceAgnosticToken,
      markSessionActive,
      loadCurrentUser,
      navigateAfterMultiWorkspaceSignInUp,
    ],
  );

  const handleSetLoginToken = useCallback(
    (token: AuthToken['token']) => {
      setLoginToken(token);
    },
    [setLoginToken],
  );

  const handleLoadWorkspaceAfterAuthentication = useCallback(async () => {
    markSessionActive();
    setIsAppEffectRedirectEnabled(false);

    try {
      await loadCurrentUser();
    } finally {
      setIsAppEffectRedirectEnabled(true);
    }
  }, [loadCurrentUser, markSessionActive, setIsAppEffectRedirectEnabled]);

  const handleGetAuthTokensFromLoginToken = useCallback(
    async (loginToken: string) => {
      try {
        const getAuthTokensResult = await getAuthTokensFromLoginToken({
          variables: {
            loginToken: loginToken,
            origin,
          },
        });

        if (isDefined(getAuthTokensResult.error)) {
          throw getAuthTokensResult.error;
        }

        if (!getAuthTokensResult.data?.getAuthTokensFromLoginToken) {
          throw new Error('No getAuthTokensFromLoginToken result');
        }

        await handleLoadWorkspaceAfterAuthentication();
      } catch (error) {
        if (
          isGraphqlErrorOfType(
            error,
            'TWO_FACTOR_AUTHENTICATION_PROVISION_REQUIRED',
          )
        ) {
          handleSetLoginToken(loginToken);
          navigate(AppPath.SignInUp);
          setSignInUpStep(SignInUpStep.TwoFactorAuthenticationProvision);
          return;
        }

        if (
          isGraphqlErrorOfType(
            error,
            'TWO_FACTOR_AUTHENTICATION_VERIFICATION_REQUIRED',
          )
        ) {
          handleSetLoginToken(loginToken);
          navigate(AppPath.SignInUp);
          setSignInUpStep(SignInUpStep.TwoFactorAuthenticationVerification);
          return;
        }
        throw error;
      }
    },
    [
      handleSetLoginToken,
      getAuthTokensFromLoginToken,
      origin,
      handleLoadWorkspaceAfterAuthentication,
      setSignInUpStep,
      navigate,
    ],
  );

  const handleCredentialsSignIn = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      await signIn({
        variables: { email, password, captchaToken },
        onCompleted: async () => {
          markSessionActive();
          const { user } = await loadCurrentUser();

          await navigateAfterMultiWorkspaceSignInUp(
            user.availableWorkspaces,
            user.email,
          );
        },
        onError: (error) => {
          if (isGraphqlErrorOfType(error, 'EMAIL_NOT_VERIFIED')) {
            setSearchParams({ email });
            setSignInUpStep(SignInUpStep.EmailVerification);
            throw error;
          }
          throw error;
        },
      });
    },
    [
      markSessionActive,
      signIn,
      loadCurrentUser,
      setSearchParams,
      setSignInUpStep,
      navigateAfterMultiWorkspaceSignInUp,
    ],
  );

  const handleCredentialsSignUp = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      const signUpResult = await signUp({
        variables: {
          email,
          password,
          captchaToken,
          locale: i18n.locale ?? SOURCE_LOCALE,
        },
      });

      if (isDefined(signUpResult.error)) {
        throw signUpResult.error;
      }

      if (isEmailVerificationRequired) {
        setSearchParams({ email });
        setSignInUpStep(SignInUpStep.EmailVerification);
        return null;
      }

      if (!signUpResult.data?.signUp) {
        throw new Error('No signUp result');
      }

      markSessionActive();

      const { user } = await loadCurrentUser();

      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
      );
    },
    [
      isEmailVerificationRequired,
      setSearchParams,
      markSessionActive,
      signUp,
      loadCurrentUser,
      setSignInUpStep,
      navigateAfterMultiWorkspaceSignInUp,
    ],
  );

  const handleCredentialsSignInInWorkspace = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      const { loginToken } = await handleGetLoginTokenFromCredentials(
        email,
        password,
        captchaToken,
      );
      await handleGetAuthTokensFromLoginToken(loginToken.token);
    },
    [handleGetLoginTokenFromCredentials, handleGetAuthTokensFromLoginToken],
  );

  const handleSignOut = useCallback(async () => {
    // Before clearSession, whose navigation kills in-flight requests.
    store.set(isPendingServerSignOutState.atom, true);

    try {
      await signOutMutation();
    } catch {}

    broadcastSignOutToOtherTabs();
    clearSession();
  }, [clearSession, signOutMutation, store]);

  const handleCredentialsSignUpInWorkspace = useCallback(
    async ({
      email,
      password,
      workspaceInviteHash,
      workspacePersonalInviteToken,
      captchaToken,
      verifyEmailRedirectPath,
    }: {
      email: string;
      password: string;
      workspaceInviteHash?: string;
      workspacePersonalInviteToken?: string;
      captchaToken?: string;
      verifyEmailRedirectPath?: string;
    }) => {
      const signUpInWorkspaceResult = await signUpInWorkspace({
        variables: {
          email,
          password,
          workspaceInviteHash,
          workspacePersonalInviteToken,
          captchaToken,
          locale: i18n.locale ?? SOURCE_LOCALE,
          ...(workspacePublicData?.id
            ? { workspaceId: workspacePublicData.id }
            : {}),
          verifyEmailRedirectPath,
        },
      });

      if (isDefined(signUpInWorkspaceResult.error)) {
        throw signUpInWorkspaceResult.error;
      }

      if (!signUpInWorkspaceResult.data?.signUpInWorkspace) {
        throw new Error('No login token');
      }

      if (isEmailVerificationRequired) {
        setSearchParams({ email });
        setSignInUpStep(SignInUpStep.EmailVerification);
        return null;
      }

      if (isMultiWorkspaceEnabled) {
        return await redirectToWorkspaceDomain(
          getWorkspaceUrl(
            signUpInWorkspaceResult.data.signUpInWorkspace.workspace
              .workspaceUrls,
          ),
          isEmailVerificationRequired ? AppPath.SignInUp : AppPath.Verify,
          {
            ...(!isEmailVerificationRequired && {
              loginToken:
                signUpInWorkspaceResult.data.signUpInWorkspace.loginToken.token,
            }),
            email,
          },
        );
      }

      await handleGetAuthTokensFromLoginToken(
        signUpInWorkspaceResult.data?.signUpInWorkspace.loginToken.token,
      );
    },
    [
      signUpInWorkspace,
      workspacePublicData,
      isMultiWorkspaceEnabled,
      handleGetAuthTokensFromLoginToken,
      setSignInUpStep,
      setSearchParams,
      isEmailVerificationRequired,
      redirectToWorkspaceDomain,
    ],
  );

  const buildRedirectUrl = useCallback(
    (
      path: string,
      params: {
        workspacePersonalInviteToken?: string;
        workspaceInviteHash?: string;
        billingCheckoutSession?: BillingCheckoutSession;
        action?: string;
      },
    ) => {
      const url = new URL(`${REACT_APP_SERVER_BASE_URL}${path}`);
      if (isDefined(params.workspaceInviteHash)) {
        url.searchParams.set('workspaceInviteHash', params.workspaceInviteHash);
      }
      if (isDefined(params.workspacePersonalInviteToken)) {
        url.searchParams.set(
          'inviteToken',
          params.workspacePersonalInviteToken,
        );
      }
      if (isDefined(params.billingCheckoutSession)) {
        url.searchParams.set(
          'billingCheckoutSessionState',
          JSON.stringify(params.billingCheckoutSession),
        );
      }

      if (isDefined(params.action)) {
        url.searchParams.set('action', params.action);
      }

      if (isDefined(workspacePublicData)) {
        url.searchParams.set('workspaceId', workspacePublicData.id);
      }

      const returnToPath = store.get(returnToPathState.atom);

      if (isNonEmptyString(returnToPath) && isValidReturnToPath(returnToPath)) {
        url.searchParams.set('returnToPath', returnToPath);
      }

      return url.toString();
    },
    [workspacePublicData, store],
  );

  const handleGoogleLogin = useCallback(
    (params: {
      workspacePersonalInviteToken?: string;
      workspaceInviteHash?: string;
      billingCheckoutSession?: BillingCheckoutSession;
      action: string;
    }) => {
      redirect(buildRedirectUrl('/auth/google', params));
    },
    [buildRedirectUrl, redirect],
  );

  const handleMicrosoftLogin = useCallback(
    (params: {
      workspacePersonalInviteToken?: string;
      workspaceInviteHash?: string;
      billingCheckoutSession?: BillingCheckoutSession;
      action: string;
    }) => {
      redirect(buildRedirectUrl('/auth/microsoft', params));
    },
    [buildRedirectUrl, redirect],
  );

  const handleGetAuthTokensFromOTP = useCallback(
    async (otp: string, loginToken: string, captchaToken?: string) => {
      const getAuthTokensFromOtpResult = await getAuthTokensFromOtp({
        variables: {
          captchaToken,
          origin,
          otp,
          loginToken,
        },
      });

      if (isDefined(getAuthTokensFromOtpResult.error)) {
        throw getAuthTokensFromOtpResult.error;
      }

      if (!getAuthTokensFromOtpResult.data?.getAuthTokensFromOTP) {
        throw new Error('No getAuthTokensFromOTP result');
      }

      await handleLoadWorkspaceAfterAuthentication();
    },
    [getAuthTokensFromOtp, origin, handleLoadWorkspaceAfterAuthentication],
  );

  return {
    getLoginTokenFromCredentials: handleGetLoginTokenFromCredentials,
    verifyEmailAndGetWorkspaceAgnosticToken:
      handleverifyEmailAndGetWorkspaceAgnosticToken,
    verifyEmailAndGetLoginToken: handleverifyEmailAndGetLoginToken,
    getAuthTokensFromLoginToken: handleGetAuthTokensFromLoginToken,
    checkUserExists: { checkUserExistsData, checkUserExistsQuery },
    clearSession,
    signOut: handleSignOut,
    signUpWithCredentials: handleCredentialsSignUp,
    signUpWithCredentialsInWorkspace: handleCredentialsSignUpInWorkspace,
    signInWithCredentialsInWorkspace: handleCredentialsSignInInWorkspace,
    signInWithCredentials: handleCredentialsSignIn,
    signInWithGoogle: handleGoogleLogin,
    signInWithMicrosoft: handleMicrosoftLogin,
    getAuthTokensFromOTP: handleGetAuthTokensFromOTP,
    navigateAfterMultiWorkspaceSignInUp,
    clerkCentralLanding: handleClerkCentralLanding,
  };
};
