import { useQuery } from '@apollo/client/react';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { currentUserState } from '@/auth/states/currentUserState';
import { MY_SUBSCRIPTION_QUERY } from '@/desync-onboarding/graphql/desyncBilling';
import {
  type DesyncPlanCountdownSubscription,
  getDesyncPlanDaysLeft,
} from '@/desync-onboarding/utils/getDesyncPlanCountdown';
import {
  dismissPlanCountdownForToday,
  isPlanCountdownDismissedToday,
} from '@/desync-onboarding/utils/planCountdownDismissal';
import { InformationBanner } from '@/information-banner/components/InformationBanner';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

// Desync: "N days left on your plan — Choose a plan" for a trial / complimentary
// / other non-Stripe plan in its last days (rules in getDesyncPlanCountdown).
// Dismissible for the rest of the day. The button opens Plan & Billing, which
// shows the plan picker + checkout for these plans.
export const InformationBannerDesyncPlanCountdown = () => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();
  const currentUser = useAtomStateValue(currentUserState);
  const [isDismissed, setIsDismissed] = useState(() =>
    isPlanCountdownDismissedToday(new Date()),
  );

  const { data } = useQuery<{
    mySubscription: DesyncPlanCountdownSubscription;
  }>(MY_SUBSCRIPTION_QUERY, {
    fetchPolicy: 'cache-and-network',
    skip: !isDefined(currentUser) || isDismissed,
  });

  const daysLeft = getDesyncPlanDaysLeft(data?.mySubscription, Date.now());

  if (isDismissed || daysLeft === null) {
    return null;
  }

  const message = plural(daysLeft, {
    one: '# day left on your plan',
    other: '# days left on your plan',
  });

  return (
    <InformationBanner
      componentInstanceId="information-banner-desync-plan-countdown"
      color={daysLeft <= 1 ? 'danger' : 'blue'}
      message={message}
      buttonTitle={t`Choose a plan`}
      buttonOnClick={() => navigateSettings(SettingsPath.PlanBilling)}
      onClose={() => {
        dismissPlanCountdownForToday(new Date());
        setIsDismissed(true);
      }}
    />
  );
};
