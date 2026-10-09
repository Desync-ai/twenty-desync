import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useActiveNavigationDrawerMode } from '@/navigation/hooks/useActiveNavigationDrawerMode';
import { useNavigationDrawerModes } from '@/navigation/hooks/useNavigationDrawerModes';
import { useSwitchNavigationDrawerMode } from '@/navigation/hooks/useSwitchNavigationDrawerMode';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Desync: Home / AI Agent / Settings rendered as full-width rows (one per line),
// matching the other sidebar items, instead of a compact icon strip that users
// kept missing. A bottom border separates this section from the navigation menu
// / chat-history content below. NavigationDrawerItem handles the collapsed
// (icon-only) rail + its own tooltip, so behaviour stays consistent everywhere.
const StyledModeSection = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.betweenSiblingsGap};
  padding-bottom: ${themeCssVariables.spacing[2]};
`;

export const MainNavigationDrawerModeSwitcher = () => {
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );
  const modes = useNavigationDrawerModes();
  const activeNavigationDrawerMode = useActiveNavigationDrawerMode();
  const { switchNavigationDrawerMode } = useSwitchNavigationDrawerMode();

  if (modes.length === 0) {
    return null;
  }

  return (
    <StyledModeSection role="group" aria-label="Navigation modes">
      {modes.map(({ Icon, label, mode }) => {
        // Layout-customization mode pins the user to the navigation menu, so the
        // other modes are inert while it's on (same guard as before).
        const isDisabled =
          mode !== NAVIGATION_DRAWER_TABS.NAVIGATION_MENU &&
          isLayoutCustomizationModeEnabled;

        return (
          <NavigationDrawerItem
            key={mode}
            label={label}
            Icon={Icon}
            active={mode === activeNavigationDrawerMode}
            onClick={() => {
              if (isDisabled) {
                return;
              }

              switchNavigationDrawerMode(mode);
            }}
          />
        );
      })}
    </StyledModeSection>
  );
};
