import { useEffect } from 'react';

import {
  captureDesyncBillingEvent,
  type DesyncBillingPlanStatus,
} from '@/desync-onboarding/utils/captureDesyncBillingEvent';

type DesyncBillingPageViewEffectProps = {
  planStatus: DesyncBillingPlanStatus;
  isPaidPlan: boolean;
};

export const DesyncBillingPageViewEffect = ({
  planStatus,
  isPaidPlan,
}: DesyncBillingPageViewEffectProps) => {
  // Mount only: the subscription refetches after a checkout or plan change
  // would otherwise count as extra page views.
  useEffect(() => {
    captureDesyncBillingEvent('billing_page_viewed', {
      surface: 'settings',
      plan_status: planStatus,
      is_paid_plan: isPaidPlan,
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};
