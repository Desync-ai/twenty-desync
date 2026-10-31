import { isNonEmptyString } from '@sniptt/guards';

// Server and application variables both reach a logic function as env vars.
export const readVariable = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return isNonEmptyString(value) ? value : undefined;
};
