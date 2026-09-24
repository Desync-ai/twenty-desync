import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Desync: base URL of the lead-gen metered AI gateway, delivered via
// /client-config (the server reads CRM_AI_BASE_URL from its env). null when
// unset — the CRM AI panel then shows a "not configured" notice.
export const crmAiBaseUrlState = createAtomState<string | null>({
  key: 'crmAiBaseUrlState',
  defaultValue: null,
});
