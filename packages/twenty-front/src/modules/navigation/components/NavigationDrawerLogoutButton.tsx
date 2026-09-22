import { useLogout } from '@/auth/hooks/useLogout';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useLingui } from '@lingui/react/macro';
import { IconLogout } from 'twenty-ui/icon';

export const NavigationDrawerLogoutButton = () => {
  const { t } = useLingui();
  const { logout } = useLogout();

  return (
    <NavigationDrawerItem label={t`Log out`} Icon={IconLogout} onClick={logout} />
  );
};
