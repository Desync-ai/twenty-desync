import { useIsSettingsDrawer } from '@/navigation/hooks/useIsSettingsDrawer';

import { MainNavigationDrawerContent } from '@/navigation/components/MainNavigationDrawerContent';
import { MainNavigationDrawerModeSwitcher } from '@/navigation/components/MainNavigationDrawerModeSwitcher';
import { NavigationDrawerLogoutButton } from '@/navigation/components/NavigationDrawerLogoutButton';
import { SettingsNavigationDrawerContent } from '@/navigation/components/SettingsNavigationDrawerContent';
import { NavigationDrawer } from '@/ui/navigation/navigation-drawer/components/NavigationDrawer';
import { NavigationDrawerFixedContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerFixedContent';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';

export type AppNavigationDrawerProps = {
  className?: string;
};

export const AppNavigationDrawer = ({
  className,
}: AppNavigationDrawerProps) => {
  const isMobile = useIsMobile();
  const isSettingsDrawer = useIsSettingsDrawer();

  // The main navigation is the home page on mobile, not a drawer.
  if (isMobile && !isSettingsDrawer) {
    return null;
  }

  return (
    <NavigationDrawer className={className}>
      {/* Mobile switches modes from the navigation bar at the bottom of the
          screen, so a second switcher inside the drawer only repeats it. */}
      {!isMobile && (
        <NavigationDrawerFixedContent>
          <MainNavigationDrawerModeSwitcher />
        </NavigationDrawerFixedContent>
      )}

      {isSettingsDrawer ? (
        <SettingsNavigationDrawerContent />
      ) : (
        <MainNavigationDrawerContent />
      )}

      {/* Pinned to the drawer footer (flex-shrink: 0) below the scrollable
          content, so a full sign-out (Twenty + Clerk) is always one click away. */}
      <NavigationDrawerFixedContent>
        <NavigationDrawerLogoutButton />
      </NavigationDrawerFixedContent>
    </NavigationDrawer>
  );
};
