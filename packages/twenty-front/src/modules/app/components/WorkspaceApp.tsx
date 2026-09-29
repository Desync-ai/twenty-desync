import { RouterProvider } from 'react-router-dom';

import { useCreateWorkspaceAppRouter } from '@/app/hooks/useCreateWorkspaceAppRouter';
import { currentUserState } from '@/auth/states/currentUserState';
import { ontologyConfigState } from '@/client-config/states/ontologyConfigState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';
import { FeatureFlagKey } from '~/generated-metadata/graphql';

export const WorkspaceApp = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const ontologyConfig = useAtomStateValue(ontologyConfigState);

  const isAdminPageEnabled =
    (currentUser?.canImpersonate || currentUser?.canAccessFullAdminPanel) ??
    false;

  const isWorkflowCoreIndexPageEnabled = useIsFeatureEnabled(
    FeatureFlagKey.IS_WORKFLOW_CORE_INDEX_PAGE_ENABLED,
  );

  return (
    <RouterProvider
      router={useCreateWorkspaceAppRouter({
        isAdminPageEnabled,
        isWorkflowCoreIndexPageEnabled,
        isOntologyEnabled: ontologyConfig.isEnabled,
      })}
    />
  );
};
