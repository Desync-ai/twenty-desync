import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';

import { DESYNC_AI_BUDGET_MODAL_ID } from '@/ai/constants/DesyncAiBudgetModalId';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

// Desync: shown when a user spends their $ AI budget (the free $1/month tier, or
// a plan cap) and tries to use the assistant. twenty-backend returns
// AI_SPEND_LIMIT_REACHED; useAgentChat opens this modal by id. "Subscribe" routes
// to Plan & Billing; Cancel lets them keep browsing the CRM.
export const DesyncAiBudgetModal = () => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();

  return (
    <ConfirmationModal
      modalInstanceId={DESYNC_AI_BUDGET_MODAL_ID}
      title={t`You've used your AI for this month`}
      subtitle={t`The free plan includes $1 of AI each month, and it resets at the start of each month. Subscribe to keep using the AI assistant now.`}
      onConfirmClick={() => navigateSettings(SettingsPath.PlanBilling)}
      confirmButtonText={t`Subscribe`}
      confirmButtonColor="accent"
    />
  );
};
