import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMemo } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  DesyncCheckoutForm,
  type DesyncPlan,
} from '@/desync-onboarding/components/DesyncCheckoutForm';
import { DESYNC_BILLING_PLANS_QUERY } from '@/desync-onboarding/graphql/desyncBilling';
import { StyledOnboardingStepHeading } from '@/onboarding/components/StyledOnboardingStepHeading';
import { StyledOnboardingStepPage } from '@/onboarding/components/StyledOnboardingStepPage';
import { StyledOnboardingStepSubtitle } from '@/onboarding/components/StyledOnboardingStepSubtitle';
import { StyledOnboardingStepTitle } from '@/onboarding/components/StyledOnboardingStepTitle';
import { UserOrMetadataLoader } from '~/loading/components/UserOrMetadataLoader';

// Desync: the entitlement paywall. Shown by DesyncEntitlementGate when a user has
// no active plan. Lets them pay from inside Twenty (they cannot reach the CRM) and,
// once the Stripe webhook writes their subscription_usage row, reloads them back
// into their preserved workspace. The checkout itself is the shared
// DesyncCheckoutForm (also used by the in-CRM Plan & Billing page).

const StyledBlock = styled.div`
  max-width: 880px;
  width: 100%;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const DesyncPaywall = () => {
  const { data, loading } = useQuery(DESYNC_BILLING_PLANS_QUERY);

  const publishableKey: string | undefined =
    data?.desyncBillingPlans?.publishableKey;

  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  if (loading && data === undefined) {
    return <UserOrMetadataLoader />;
  }

  const plans: DesyncPlan[] = data?.desyncBillingPlans?.plans ?? [];

  return (
    <StyledOnboardingStepPage>
      <StyledOnboardingStepHeading>
        <StyledOnboardingStepTitle>Subscribe to continue</StyledOnboardingStepTitle>
        <StyledOnboardingStepSubtitle>
          Your plan has expired. Choose a plan to get back into your workspace.
          Everything is right where you left it.
        </StyledOnboardingStepSubtitle>
      </StyledOnboardingStepHeading>

      <StyledBlock>
        {stripePromise !== null ? (
          <Elements stripe={stripePromise}>
            <DesyncCheckoutForm plans={plans} />
          </Elements>
        ) : (
          <StyledStatus>
            Billing isn’t configured on this environment. Please contact support.
          </StyledStatus>
        )}
      </StyledBlock>
    </StyledOnboardingStepPage>
  );
};
