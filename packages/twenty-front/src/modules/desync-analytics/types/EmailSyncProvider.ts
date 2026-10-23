import { type FunnelEventProperties } from '@/desync-analytics/types/FunnelEventProperties';

export type EmailSyncProvider =
  FunnelEventProperties['email_sync_connected']['provider'];
