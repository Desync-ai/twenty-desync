import { isNonEmptyString } from '@sniptt/guards';

import { type JevNoulQuestion, type JevSpec } from 'src/types/jev';
import { type PersonNode } from 'src/types/person-node';

const TEXT_MAX = 400;

const clip = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();

  return isNonEmptyString(trimmed) ? trimmed.slice(0, TEXT_MAX) : undefined;
};

// Same wording as the extension's lib/classify.ts, so both read a person alike.
const PERSON_QUESTION: JevNoulQuestion = {
  type: 'noul',
  instructions: 'Is `person` one real, individual person?',
  criteria: {
    true: 'One human being under their own name, with a role, a career or a school, even when the headline is short or odd.',
    false:
      'Not one person: a company, school, brand or product page, a group, an event, a newsletter, or an account run as a bot or for a brand.',
  },
};

// Only what the questions need: no email, phone or link goes to TypeSafe.
export const buildPersonState = (person: PersonNode) => {
  const name = [person.name?.firstName, person.name?.lastName]
    .map((part) => part?.trim())
    .filter(isNonEmptyString)
    .join(' ');

  return {
    person: Object.fromEntries(
      Object.entries({
        name: clip(name),
        job_title: clip(person.jobTitle),
        company: clip(person.company?.name),
        city: clip(person.city),
      }).filter(([, value]) => value !== undefined),
    ),
  };
};

// The ICP rubric rides in its own question, so the person question never reads it.
export const buildPersonSpec = (
  person: PersonNode,
  icpRubric?: string,
): JevSpec => {
  const target = icpRubric?.trim();

  return {
    state: buildPersonState(person),
    questions: {
      person: PERSON_QUESTION,
      ...(isNonEmptyString(target)
        ? {
            icp: {
              type: 'noul',
              instructions: { question: 'Does `person` fit `target`?', target },
            },
          }
        : {}),
    },
  };
};
