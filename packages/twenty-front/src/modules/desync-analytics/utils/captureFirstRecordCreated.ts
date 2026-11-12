import { type FunnelEventProperties } from '@/desync-analytics/types/FunnelEventProperties';
import { captureFunnelEvent } from '@/desync-analytics/utils/captureFunnelEvent';
import { getFunnelRecordObject } from '@/desync-analytics/utils/getFunnelRecordObject';

const FIRST_RECORD_CREATED_STORAGE_KEY_PREFIX =
  'desyncAnalytics.firstRecordCreated.';

// Fires first_record_created once per workspace per browser (deduped through
// localStorage; PostHog "first time" funnels absorb the rare duplicate from a
// second browser). Workspaces that already had records before this shipped fire
// once on their next creation, which is fine for new-signup funnels.
export const captureFirstRecordCreated = ({
  workspaceId,
  objectNameSingular,
  source,
}: {
  workspaceId: string | undefined;
  objectNameSingular: string;
  source: FunnelEventProperties['first_record_created']['source'];
}): void => {
  if (workspaceId === undefined) {
    return;
  }

  const storageKey = `${FIRST_RECORD_CREATED_STORAGE_KEY_PREFIX}${workspaceId}`;

  try {
    if (localStorage.getItem(storageKey) !== null) {
      return;
    }
    localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // Storage unavailable (private mode, quota): don't risk spamming the event.
    return;
  }

  captureFunnelEvent('first_record_created', {
    source,
    object: getFunnelRecordObject(objectNameSingular),
  });
};
