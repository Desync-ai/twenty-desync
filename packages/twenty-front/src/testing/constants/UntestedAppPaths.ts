import { AppPath } from 'twenty-shared/types';

export const UNTESTED_APP_PATHS = [
  AppPath.Settings,
  AppPath.Developers,
  // Public, unauthenticated redirect route handled in useCreateWorkspaceAppRouter
  // — not part of the onboarding/auth page-change navigation matrix.
  AppPath.Dpa,
  // Desync: Get-started is only ever a redirect TARGET (first-run landing), never
  // a source location in the navigation matrix, so it has no per-location cases.
  AppPath.GetStarted,
];
