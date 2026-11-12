import { type FunnelEventProperties } from '@/desync-analytics/types/FunnelEventProperties';

type FunnelRecordObject =
  FunnelEventProperties['first_record_created']['object'];

const STANDARD_OBJECTS: FunnelRecordObject[] = [
  'person',
  'company',
  'opportunity',
  'note',
  'task',
];

// Custom object names are chosen by the customer and can describe their
// business, so they are bucketed as 'other' instead of being sent.
export const getFunnelRecordObject = (
  objectNameSingular: string,
): FunnelRecordObject =>
  STANDARD_OBJECTS.find((object) => object === objectNameSingular) ?? 'other';
