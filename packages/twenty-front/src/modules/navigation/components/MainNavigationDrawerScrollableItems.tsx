import { NavigationDrawerOpenedSection } from '@/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection';
import { NavigationDrawerWorkspaceSectionSkeletonLoader } from '@/object-metadata/components/NavigationDrawerWorkspaceSectionSkeletonLoader';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useSwitchNavigationDrawerMode } from '@/navigation/hooks/useSwitchNavigationDrawerMode';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';

import { styled } from '@linaria/react';
import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';

import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconApps, IconComment } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { PermissionFlagType } from '~/generated-metadata/graphql';

const FavoritesSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/favorites/components/FavoritesSectionDispatcher').then(
    (module) => ({
      default: module.FavoritesSectionDispatcher,
    }),
  ),
);

const WorkspaceSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher').then(
    (module) => ({
      default: module.WorkspaceSectionDispatcher,
    }),
  ),
);

const StyledScrollableItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const MainNavigationDrawerScrollableItems = () => {
  const location = useLocation();
  const hasAiPermission = useHasPermissionFlag(PermissionFlagType.AI);
  const { switchNavigationDrawerMode } = useSwitchNavigationDrawerMode();

  return (
    <StyledScrollableItemsContainer>
      <NavigationDrawerItem
        label="Integrations"
        to={getSettingsPath(SettingsPath.Integrations)}
        Icon={IconApps}
        active={location.pathname.includes('/settings/integrations')}
      />
      {hasAiPermission && (
        <NavigationDrawerItem
          label="AI Agent"
          Icon={IconComment}
          onClick={() =>
            switchNavigationDrawerMode(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY)
          }
          active={location.pathname.startsWith('/chat')}
        />
      )}
      <NavigationDrawerOpenedSection />
      <Suspense fallback={<NavigationDrawerWorkspaceSectionSkeletonLoader />}>
        <FavoritesSectionDispatcher />
        <WorkspaceSectionDispatcher />
      </Suspense>
    </StyledScrollableItemsContainer>
  );
};
