import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Set true by SignInUpClerkExchangeEffect when a Clerk -> Twenty token exchange
// cannot complete (no Clerk JWT available, or the exchange mutation /
// loadCurrentUser failed). The Clerk sign-in surface reads it to fall back from
// the "Signing you in…" spinner to a retry action instead of spinning forever.
// In-memory only (not persisted), so it resets on reload.
export const clerkExchangeFailedState = createAtomState<boolean>({
  key: 'clerkExchangeFailedState',
  defaultValue: false,
});
