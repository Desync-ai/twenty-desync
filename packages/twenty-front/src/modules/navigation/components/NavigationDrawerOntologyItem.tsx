import { AppPath } from 'twenty-shared/types';
import { IconSitemap } from 'twenty-ui/icon';

import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Only reachable at all when the server has ONTOLOGY_CONSOLE_URL set; see
// ontologyConfigState.
export const NavigationDrawerOntologyItem = () => {
  const ontologyConfig = useAtomStateValue(ontologyConfigState);

  if (!ontologyConfig.isEnabled) {
    return null;
  }

  return (
    <NavigationDrawerItem
      label="Ontology"
      Icon={IconSitemap}
      to={AppPath.Ontology}
    />
  );
};
