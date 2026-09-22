import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type ClerkSignOut = () => Promise<void>;

// Holds Clerk's signOut handle, published by ClerkSignOutRegistrar only while a
// ClerkProvider is mounted (i.e. Clerk enabled). The value is wrapped in an
// object so Jotai never mistakes the function for a state updater. It stays
// `{ signOut: null }` whenever Clerk is disabled, which lets useLogout reach the
// handle without ever calling a Clerk hook itself.
export const clerkSignOutState = createAtomState<{
  signOut: ClerkSignOut | null;
}>({
  key: 'clerkSignOutState',
  defaultValue: { signOut: null },
});
