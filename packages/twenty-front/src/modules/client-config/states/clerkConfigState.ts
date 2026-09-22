import { type ClerkConfig } from '@/client-config/types/ClerkConfig';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const clerkConfigState = createAtomState<ClerkConfig>({
  key: 'clerkConfigState',
  defaultValue: {
    isEnabled: false,
    publishableKey: null,
  },
});
