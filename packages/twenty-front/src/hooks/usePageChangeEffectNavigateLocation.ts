import { verifyEmailRedirectPathState } from '@/app/states/verifyEmailRedirectPathState';
import { ONBOARDING_PATHS } from '@/auth/constants/OnboardingPaths';
import { ONGOING_USER_CREATION_PATHS } from '@/auth/constants/OngoingUserCreationPaths';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { billingState } from '@/client-config/states/billingState';
import { hasSeenGetStarted } from '@/desync-onboarding/utils/getStartedSeen';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { isMinimalMetadataReadyState } from '@/metadata-store/states/isMinimalMetadataReadyState';
import { useDefaultHomePagePath } from '@/navigation/hooks/useDefaultHomePagePath';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { useOnboardingStatus } from '@/onboarding/hooks/useOnboardingStatus';
import { isOnboardingCheckoutPendingState } from '@/onboarding/states/isOnboardingCheckoutPendingState';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useIsWorkspaceActivationStatusEqualsTo } from '@/workspace/hooks/useIsWorkspaceActivationStatusEqualsTo';
import { isValidReturnToPath } from '@/auth/utils/isValidReturnToPath';
import { useQuery } from '@apollo/client/react';
import { isNonEmptyString } from '@sniptt/guards';
import { matchPath, useLocation } from 'react-router-dom';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import {
  FindOnePageLayoutTypeDocument,
  OnboardingStatus,
  PageLayoutType,
  PermissionFlagType,
} from '~/generated-metadata/graphql';
import { isMatchingLocation } from '~/utils/isMatchingLocation';

const readReturnToPathFromUrlSearchParams = (): string | null => {
  const value = new URLSearchParams(window.location.search).get('returnToPath');

  return value && isValidReturnToPath(value) ? value : null;
};

export const usePageChangeEffectNavigateLocation = () => {
  const isLogged = useIsLogged();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();
  const onboardingStatus = useOnboardingStatus();
  const isWorkspaceSuspended = useIsWorkspaceActivationStatusEqualsTo(
    WorkspaceActivationStatus.SUSPENDED,
  );
  const { defaultHomePagePath } = useDefaultHomePagePath();
  const hasAiPermission = useHasPermissionFlag(PermissionFlagType.AI);
  const isMobile = useIsMobile();
  const location = useLocation();
  const billing = useAtomStateValue(billingState);
  const isBillingEnabled = billing?.isBillingEnabled ?? false;

  const someMatchingLocationOf = (appPaths: AppPath[]): boolean =>
    appPaths.some((appPath) => isMatchingLocation(location, appPath));

  const objectNamePlural =
    matchPath(AppPath.RecordIndexPage, location.pathname)?.params
      .objectNamePlural ?? '';
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const objectMetadataItem = objectMetadataItems?.find(
    (objectMetadataItem) => objectMetadataItem.namePlural === objectNamePlural,
  );
  const isMinimalMetadataReady = useAtomStateValue(isMinimalMetadataReadyState);

  const pageLayoutId = matchPath(AppPath.PageLayoutPage, location.pathname)
    ?.params.pageLayoutId;
  const isOnPageLayoutPage = isMatchingLocation(
    location,
    AppPath.PageLayoutPage,
  );

  const { data: pageLayoutData, loading: isPageLayoutLoading } = useQuery(
    FindOnePageLayoutTypeDocument,
    {
      variables: { id: pageLayoutId ?? '' },
      skip: !isOnPageLayoutPage || !isDefined(pageLayoutId),
    },
  );
  const verifyEmailRedirectPath = useAtomStateValue(
    verifyEmailRedirectPathState,
  );

  const returnToPath = useAtomStateValue(returnToPathState);
  const resolvedReturnToPath = isNonEmptyString(returnToPath)
    ? returnToPath
    : readReturnToPathFromUrlSearchParams();

  // Desync: the FIRST time a user enters a workspace (just created it / joined
  // it), land them on the guided "Get started" page so they always have an
  // obvious next step instead of a dense, empty grid. This fires once per
  // workspace (tracked in localStorage, set when they reach the page — see
  // getStartedSeen) and only for a COMPLETED onboarding, so it never interrupts
  // the signup/onboarding flow and never hijacks a returning user's landing.
  const shouldLandOnGetStartedFirst =
    onboardingStatus === OnboardingStatus.COMPLETED &&
    !hasSeenGetStarted(currentWorkspace?.id);

  // Otherwise the default landing is the AI agent chat for AI-enabled desktop
  // users — for BOTH opening the workspace (Index) and the post-login /
  // post-onboarding redirect (a COMPLETED user sitting on an onboarding path).
  // Falls back to the records home otherwise. defaultHomePagePath itself is left
  // unchanged so the nav "home" / return destinations still point at records
  // (avoids the return-to-home → chat loop).
  const landingPath = shouldLandOnGetStartedFirst
    ? AppPath.GetStarted
    : hasAiPermission && !isMobile
      ? getAppPath(AppPath.AiChat, { threadId: null })
      : defaultHomePagePath;

  const isOnboardingCheckoutPending = useAtomStateValue(
    isOnboardingCheckoutPendingState,
  );

  if (
    (!isLogged || !isOnAWorkspace || !isDefined(currentWorkspace)) &&
    !someMatchingLocationOf([
      ...ONGOING_USER_CREATION_PATHS,
      AppPath.ResetPassword,
    ])
  ) {
    return AppPath.SignInUp;
  }

  if (
    onboardingStatus === OnboardingStatus.PLAN_REQUIRED &&
    !someMatchingLocationOf([
      AppPath.PlanRequired,
      AppPath.PlanRequiredSuccess,
      AppPath.BookCall,
    ])
  ) {
    if (
      isMatchingLocation(location, AppPath.VerifyEmail) &&
      isDefined(verifyEmailRedirectPath)
    ) {
      return verifyEmailRedirectPath;
    }
    return AppPath.PlanRequired;
  }

  if (isWorkspaceSuspended) {
    if (!isMatchingLocation(location, AppPath.SettingsCatchAll)) {
      return `${AppPath.SettingsCatchAll.replace('/*', '')}/${
        SettingsPath.Billing
      }`;
    }

    return;
  }

  if (
    onboardingStatus === OnboardingStatus.WORKSPACE_ACTIVATION &&
    !isMatchingLocation(location, AppPath.WorkspaceActivation)
  ) {
    return AppPath.WorkspaceActivation;
  }

  if (
    onboardingStatus === OnboardingStatus.PROFILE_CREATION &&
    !isMatchingLocation(location, AppPath.CreateProfile)
  ) {
    return AppPath.CreateProfile;
  }

  if (
    onboardingStatus === OnboardingStatus.SYNC_EMAIL &&
    !isMatchingLocation(location, AppPath.SyncEmails)
  ) {
    return AppPath.SyncEmails;
  }

  // Apps-installation and invite-team onboarding steps removed — never route to them.

  if (
    onboardingStatus === OnboardingStatus.BOOK_CALL &&
    !isMatchingLocation(location, AppPath.BookCall)
  ) {
    return AppPath.BookCall;
  }

  if (isBillingEnabled && onboardingStatus === OnboardingStatus.COMPLETED) {
    if (isMatchingLocation(location, AppPath.InviteTeam)) {
      return AppPath.PlanRequired;
    }
    if (isMatchingLocation(location, AppPath.PlanRequired)) {
      return;
    }
  }

  if (
    onboardingStatus === OnboardingStatus.COMPLETED &&
    someMatchingLocationOf([
      ...ONBOARDING_PATHS,
      ...ONGOING_USER_CREATION_PATHS,
    ]) &&
    !isMatchingLocation(location, AppPath.ResetPassword) &&
    isLogged &&
    isOnAWorkspace
  ) {
    if (
      isMatchingLocation(location, AppPath.PlanRequiredSuccess) &&
      isOnboardingCheckoutPending
    ) {
      return;
    }

    return resolvedReturnToPath ?? landingPath;
  }

  if (isMatchingLocation(location, AppPath.Index) && isLogged) {
    return resolvedReturnToPath ?? landingPath;
  }

  if (
    isMinimalMetadataReady &&
    isMatchingLocation(location, AppPath.RecordIndexPage) &&
    !isDefined(objectMetadataItem)
  ) {
    return AppPath.NotFound;
  }

  if (
    isOnPageLayoutPage &&
    isDefined(pageLayoutId) &&
    !isPageLayoutLoading &&
    (!isDefined(pageLayoutData?.getPageLayout) ||
      pageLayoutData.getPageLayout.type !== PageLayoutType.STANDALONE_PAGE)
  ) {
    return AppPath.NotFound;
  }

  return;
};
