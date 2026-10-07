import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
export const isGoogleContactsEnabledState = createAtomState<boolean>({
  key: 'isGoogleContactsEnabled',
  defaultValue: false,
});
