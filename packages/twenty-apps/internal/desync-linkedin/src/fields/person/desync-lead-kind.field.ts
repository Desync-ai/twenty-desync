import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { LEAD_KIND_OPTIONS } from 'src/constants/lead-kind-options';
import {
  DESYNC_FIELD_UNIVERSAL_IDENTIFIERS,
  DESYNC_SELECT_OPTION_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';
import { buildSelectOptions } from 'src/utils/build-select-options';

export default defineField({
  universalIdentifier: DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncLeadKind,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'desyncLeadKind',
  label: 'Lead kind',
  description:
    'What the Jev classifier read this person as: ICP, a person, not a person, or undecided.',
  icon: 'IconTarget',
  isNullable: true,
  options: buildSelectOptions({
    meta: LEAD_KIND_OPTIONS,
    ids: DESYNC_SELECT_OPTION_UNIVERSAL_IDENTIFIERS.leadKind,
  }),
});
