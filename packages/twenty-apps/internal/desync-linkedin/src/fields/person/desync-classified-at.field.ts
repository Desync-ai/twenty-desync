import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncClassifiedAt,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'desyncClassifiedAt',
  label: 'Classified at',
  description: 'When the Jev classifier last read this person.',
  icon: 'IconClock',
  isNullable: true,
});
