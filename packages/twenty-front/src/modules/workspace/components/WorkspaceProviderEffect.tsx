import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useReadWorkspaceUrlFromCurrentLocation } from '@/domain-manager/hooks/useReadWorkspaceUrlFromCurrentLocation';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { domainConfigurationState } from '@/domain-manager/states/domainConfigurationState';
import { lastAuthenticatedWorkspaceDomainState } from '@/domain-manager/states/lastAuthenticatedWorkspaceDomainState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useEffect, useCallback } from 'react';

import { useInitializeQueryParamState } from '@/app/hooks/useInitializeQueryParamState';
import { useGetPublicWorkspaceDataByDomain } from '@/domain-manager/hooks/useGetPublicWorkspaceDataByDomain';
import { isDefined } from 'twenty-shared/utils';
import { type WorkspaceUrls } from '~/generated-metadata/graphql';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';

const getCurrentSearchParams = (): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(window.location.search));

export const WorkspaceProviderEffect = () => {
  const { data: getPublicWorkspaceData } = useGetPublicWorkspaceDataByDomain();

  const lastAuthenticatedWorkspaceDomain = useAtomStateValue(
    lastAuthenticatedWorkspaceDomainState,
  );

  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();

  const { currentLocationHostname } = useReadWorkspaceUrlFromCurrentLocation();

  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );

  const domainConfiguration = useAtomStateValue(domainConfigurationState);

  // A returning user who opens the bare apex front domain (no workspace
  // subdomain) is sent straight to their last workspace via the persisted hint
  // cookie, skipping the /welcome -> central -> Clerk re-exchange detour. Apex
  // only: on the central domain we let the Clerk exchange establish the session
  // instead, since a central -> workspace cookie redirect would loop whenever
  // that workspace's session is invalid.
  const isOnApexFrontDomain =
    window.location.hostname === domainConfiguration.frontDomain;

  const { initializeQueryParamState } = useInitializeQueryParamState();

  const isWorkspaceHostnameMatchCurrentLocationHostname = useCallback(
    (workspaceUrls: WorkspaceUrls) => {
      const { hostname } = new URL(getWorkspaceUrl(workspaceUrls));
      return hostname === currentLocationHostname;
    },
    [currentLocationHostname],
  );

  useEffect(() => {
    if (
      isMultiWorkspaceEnabled &&
      isDefined(getPublicWorkspaceData) &&
      !isWorkspaceHostnameMatchCurrentLocationHostname(
        getPublicWorkspaceData.workspaceUrls,
      )
    ) {
      redirectToWorkspaceDomain(
        getWorkspaceUrl(getPublicWorkspaceData.workspaceUrls),
        window.location.pathname,
        getCurrentSearchParams(),
      );
    }
  }, [
    isMultiWorkspaceEnabled,
    redirectToWorkspaceDomain,
    getPublicWorkspaceData,
    currentLocationHostname,
    isWorkspaceHostnameMatchCurrentLocationHostname,
  ]);

  useEffect(() => {
    if (
      isMultiWorkspaceEnabled &&
      isOnApexFrontDomain &&
      isDefined(lastAuthenticatedWorkspaceDomain) &&
      'workspaceUrl' in lastAuthenticatedWorkspaceDomain &&
      isDefined(lastAuthenticatedWorkspaceDomain?.workspaceUrl)
    ) {
      initializeQueryParamState();
      redirectToWorkspaceDomain(
        lastAuthenticatedWorkspaceDomain.workspaceUrl,
        window.location.pathname,
        getCurrentSearchParams(),
      );
    }
  }, [
    isMultiWorkspaceEnabled,
    isOnApexFrontDomain,
    lastAuthenticatedWorkspaceDomain,
    redirectToWorkspaceDomain,
    initializeQueryParamState,
  ]);

  return <></>;
};
