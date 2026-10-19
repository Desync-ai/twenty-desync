import { msg } from '@lingui/core/macro';
import { IconMail, IconSearch, IconSparkles } from 'twenty-ui/icon';

import { type SuggestedPrompt } from '@/ai/types/SuggestedPrompt';

export const DEFAULT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'find-leads',
    label: msg`Find leads`,
    Icon: IconSearch,
    prompts: [
      msg`Find me a list of SaaS companies in New York with 50-200 employees and add them to my CRM.`,
      msg`Find marketing directors at mid-size ecommerce companies and add them to my CRM as contacts.`,
    ],
  },
  {
    id: 'find-contacts',
    label: msg`Find contacts at a company`,
    Icon: IconMail,
    prompts: [
      msg`Find the key people (name, title, email) at this company and add them to my CRM as contacts. Company: `,
    ],
  },
  {
    id: 'capabilities',
    label: msg`See what I can do`,
    Icon: IconSparkles,
    mode: 'SEND',
    prompts: [msg`What can you do?`],
  },
];
