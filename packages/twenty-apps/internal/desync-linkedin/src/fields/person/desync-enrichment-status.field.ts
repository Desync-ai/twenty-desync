import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { ENRICHMENT_STATUS_OPTIONS } from 'src/constants/enrichment-status-options';
import {
  DESYNC_FIELD_UNIVERSAL_IDENTIFIERS,
  DESYNC_SELECT_OPTION_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import { buildSelectOptions } from 'src/utils/build-select-options';

export default defineField({
  universalIdentifier:
    DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncEnrichmentStatus,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'desyncEnrichmentStatus',
  label: 'Enrichment status',
  description: 'Outcome of the latest Apollo enrichment.',
  icon: 'IconProgressCheck',
  isNullable: true,
  options: buildSelectOptions({
    meta: ENRICHMENT_STATUS_OPTIONS,
    ids: DESYNC_SELECT_OPTION_UNIVERSAL_IDENTIFIERS.enrichmentStatus,
  }),
});
