import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncSentToInstantlyAt,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'desyncSentToInstantlyAt',
  label: 'Sent to Instantly at',
  description: 'When this person was added to the Instantly campaign.',
  icon: 'IconSend',
  isNullable: true,
});
