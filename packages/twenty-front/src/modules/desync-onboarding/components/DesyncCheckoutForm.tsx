import { useApolloClient, useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { themeCssVariables, useTheme } from 'twenty-ui/theme-constants';

import { DesyncPlanCard } from '@/desync-onboarding/components/DesyncPlanCard';
import {
  ACTIVATE_DESYNC_SUBSCRIPTION,
  CREATE_DESYNC_SUBSCRIPTION,
  MY_ENTITLEMENT_QUERY,
} from '@/desync-onboarding/graphql/desyncBilling';

// Desync: the card-based subscribe checkout (plan cards + Stripe card + the
// create → confirm → activate → poll-entitlement dance). Shared by the lockout
// paywall (DesyncPaywall) and the in-CRM Plan & Billing page so there is ONE
// checkout implementation. Must be rendered inside a Stripe <Elements> provider.

export type DesyncPlan = {
  key: string;
  name: string;
  priceIdMonthly: string;
  priceIdAnnual: string;
  monthlyPriceUsd: number;
  recordQuota: number;
};

// Stripe's CardElement renders in its own iframe and can't read our CSS vars; the
// dark theme's font colors are display-p3 (which Stripe can't parse). Map the
// active theme to safe hex so the card text isn't black-on-dark. Shared by the
// subscribe checkout and the change-card form.
export const getStripeCardStyle = (isDark: boolean) => ({
  base: {
    color: isDark ? '#EBEBEB' : '#283238',
    fontFamily: 'inherit',
    fontSize: '16px',
    '::placeholder': { color: isDark ? '#808080' : '#8B948E' },
    iconColor: isDark ? '#EBEBEB' : '#283238',
  },
  invalid: { color: '#D4544C', iconColor: '#D4544C' },
});

// Annual shows the full yearly total AND the monthly-equivalent (10% off);
// monthly shows the plain monthly price. (Kept for callers that want a one-liner.)
export const formatPlanPrice = (monthlyPriceUsd: number, annual: boolean): string =>
  annual
    ? `$${Math.round(monthlyPriceUsd * 12 * 0.9).toLocaleString()}/yr ($${Math.round(
        monthlyPriceUsd * 0.9,
      )}/mo)`
    : `$${monthlyPriceUsd}/mo`;

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-width: 100%;
  width: 100%;
`;

const StyledPlans = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledToggleRow = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledToggleButton = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active ? themeCssVariables.color.blue : 'transparent'};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ active }) =>
    active ? themeCssVariables.font.color.inverted : themeCssVariables.font.color.secondary};
  cursor: pointer;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledCardBox = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type DesyncCheckoutFormProps = {
  plans: DesyncPlan[];
  // Called once entitlement is confirmed. Defaults to a full reload (back into
  // the workspace for the paywall; refreshes the settings page otherwise).
  onComplete?: () => void;
  // CTA prefix, e.g. "Subscribe to" (default) or "Upgrade to".
  ctaPrefix?: string;
};

export const DesyncCheckoutForm = ({
  plans,
  onComplete,
  ctaPrefix = 'Subscribe to',
}: DesyncCheckoutFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const apollo = useApolloClient();
  const { enqueueToast } = useToast();
  const theme = useTheme();
  const cardElementStyle = getStripeCardStyle(theme.name === 'dark');

  const [createSubscription] = useMutation(CREATE_DESYNC_SUBSCRIPTION);
  const [activateSubscription] = useMutation(ACTIVATE_DESYNC_SUBSCRIPTION);

  const [annual, setAnnual] = useState(false);
  const [selectedKey, setSelectedKey] = useState(plans[0]?.key ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  const selectedPlan = plans.find((p) => p.key === selectedKey) ?? plans[0];

  const handlePay = async () => {
    if (!stripe || !elements || !selectedPlan || submitting) {
      return;
    }

    const priceId = annual
      ? selectedPlan.priceIdAnnual
      : selectedPlan.priceIdMonthly;

    setSubmitting(true);
    setStatus('Setting up checkout…');

    try {
      const { data: created } = await createSubscription({
        variables: { priceId },
      });
      const clientSecret = created?.createDesyncSubscription?.clientSecret;
      const setupIntentId = created?.createDesyncSubscription?.setupIntentId;

      if (!clientSecret || !setupIntentId) {
        throw new Error('Could not start checkout. Please try again.');
      }

      const card = elements.getElement(CardElement);
      if (!card) {
        throw new Error('Card field is not ready.');
      }

      setStatus('Confirming your card…');
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });

      if (result.error) {
        throw new Error(result.error.message ?? 'Card confirmation failed.');
      }

      setStatus('Activating your subscription…');
      await activateSubscription({ variables: { setupIntentId, priceId } });

      // The subscription_usage row is written asynchronously by the Stripe
      // webhook. Poll entitlement until it lands, then run onComplete.
      setStatus('Finalizing, this can take a few seconds…');
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const { data: entitlement } = await apollo.query({
          query: MY_ENTITLEMENT_QUERY,
          fetchPolicy: 'network-only',
        });
        if (entitlement?.myEntitlement?.entitled === true) {
          if (onComplete) {
            onComplete();
          } else {
            window.location.reload();
          }
          return;
        }
      }

      setStatus(
        'Payment received. Activation is taking a moment. Refresh in a bit to continue.',
      );
      setSubmitting(false);
    } catch (error) {
      setSubmitting(false);
      setStatus('');
      enqueueToast({
        children:
          error instanceof Error
            ? error.message
            : 'Payment failed. Please try again.',
        variant: 'error',
      });
    }
  };

  return (
    <StyledForm>
      <StyledToggleRow>
        <StyledToggleButton active={!annual} onClick={() => setAnnual(false)}>
          Monthly
        </StyledToggleButton>
        <StyledToggleButton active={annual} onClick={() => setAnnual(true)}>
          Annual (save 10%)
        </StyledToggleButton>
      </StyledToggleRow>

      <StyledPlans>
        {plans.map((plan) => (
          <DesyncPlanCard
            key={plan.key}
            plan={plan}
            annual={annual}
            selected={plan.key === selectedKey}
            onSelect={() => setSelectedKey(plan.key)}
          />
        ))}
      </StyledPlans>

      <StyledCardBox>
        <CardElement options={{ hidePostalCode: true, style: cardElementStyle }} />
      </StyledCardBox>

      {status !== '' && <StyledStatus>{status}</StyledStatus>}

      <MainButton
        onClick={handlePay}
        disabled={!stripe || submitting || !selectedPlan}
        fullWidth
      >
        {submitting ? 'Processing…' : `${ctaPrefix} ${selectedPlan?.name ?? ''}`}
      </MainButton>
    </StyledForm>
  );
};
