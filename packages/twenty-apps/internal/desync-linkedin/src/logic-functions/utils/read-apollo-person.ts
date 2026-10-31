import { isNonEmptyString, isObject } from '@sniptt/guards';

export type ApolloSuggestion = {
  email?: string;
  jobTitle?: string;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isObject(value) ? (value as Record<string, unknown>) : undefined;

// Composio has wrapped Apollo's people/match reply at different depths across
// toolkit versions, so the person is looked for where each one put it.
const findPerson = (data: unknown): Record<string, unknown> | undefined => {
  const root = asRecord(data);
  const candidates = [
    root?.person,
    asRecord(root?.data)?.person,
    asRecord(root?.response_data)?.person,
  ];

  return candidates.map(asRecord).find((candidate) => candidate !== undefined);
};

// Apollo marks emails it could not verify with a placeholder; those are not
// suggestions worth writing.
const isRealEmail = (value: unknown): value is string =>
  isNonEmptyString(value) &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
  !/not_unlocked|domain\.com$/i.test(value);

export const readApolloPerson = (data: unknown): ApolloSuggestion | null => {
  const person = findPerson(data);

  if (person === undefined) {
    return null;
  }

  const suggestion: ApolloSuggestion = {};

  if (isRealEmail(person.email)) {
    suggestion.email = person.email.trim().toLowerCase();
  }

  if (isNonEmptyString(person.title)) {
    suggestion.jobTitle = person.title.trim().slice(0, 120);
  }

  return suggestion.email || suggestion.jobTitle ? suggestion : null;
};
