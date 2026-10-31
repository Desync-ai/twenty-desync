import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { DESYNC_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier:
    DESYNC_FIELD_UNIVERSAL_IDENTIFIERS.person.desyncSuggestedJobTitle,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.TEXT,
  name: 'desyncSuggestedJobTitle',
  label: 'Suggested job title',
  description:
    'Job title Apollo found. A suggestion: Job Title is never overwritten.',
  icon: 'IconBriefcase',
  isNullable: true,
});
