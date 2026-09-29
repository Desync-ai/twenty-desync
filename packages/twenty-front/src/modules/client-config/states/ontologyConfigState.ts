import { type OntologyConfig } from '@/client-config/types/OntologyConfig';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const ontologyConfigState = createAtomState<OntologyConfig>({
  key: 'ontologyConfigState',
  defaultValue: {
    isEnabled: false,
    consoleUrl: null,
  },
});
