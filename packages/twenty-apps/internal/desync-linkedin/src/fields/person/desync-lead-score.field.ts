import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncLeadScore,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.NUMBER,
  name: 'desyncLeadScore',
  label: 'Lead score',
  description: 'Probability (0-1) behind the lead kind.',
  icon: 'IconGauge',
  isNullable: true,
});
