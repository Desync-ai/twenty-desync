import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

/**
 * Desync: when a brand-new user creates their workspace, we no longer redirect
 * to the workspace subdomain right away. Activation is kicked server-side and
 * runs in the background while the user fills the signup questionnaire, so the
 * ~activation time is hidden behind useful work. This holds the freshly-minted
 * workspace's subdomain URL + login token (TTL 15m — comfortably longer than the
 * questionnaire) so the questionnaire's onCompleted can redirect straight into
 * the (by then usually ACTIVE) workspace. `null` on the legacy path, where the
 * redirect happens inline in createWorkspace.
 */
export type PendingWorkspaceLanding = {
  workspaceUrl: string;
  loginToken: string;
};

export const pendingWorkspaceLandingState =
  createAtomState<PendingWorkspaceLanding | null>({
    key: 'pendingWorkspaceLandingState',
    defaultValue: null,
  });
