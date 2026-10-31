import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncSuggestedEmail,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'desyncSuggestedEmail',
  label: 'Suggested email',
  description:
    "Work email Apollo found. A suggestion: the person's own Emails field is never overwritten.",
  icon: 'IconMail',
  isNullable: true,
});
