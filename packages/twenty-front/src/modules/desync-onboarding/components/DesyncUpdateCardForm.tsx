import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { themeCssVariables, useTheme } from 'twenty-ui/theme-constants';

import { getStripeCardStyle } from '@/desync-onboarding/components/DesyncCheckoutForm';
import {
  CREATE_DESYNC_SETUP_INTENT,
  SET_DESYNC_DEFAULT_CARD,
} from '@/desync-onboarding/graphql/desyncBilling';

// Desync: change the card on file. Mints a SetupIntent, confirms the new card, and
// sets it as the default payment method (used for the active sub's renewals). Must
// be rendered inside a Stripe <Elements> provider.

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  width: 100%;
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

export const DesyncUpdateCardForm = ({ onDone }: { onDone?: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { enqueueToast } = useToast();
  const theme = useTheme();
  const cardElementStyle = getStripeCardStyle(theme.name === 'dark');

  const [createSetupIntent] = useMutation(CREATE_DESYNC_SETUP_INTENT);
  const [setDefaultCard] = useMutation(SET_DESYNC_DEFAULT_CARD);

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  const handleUpdate = async () => {
    if (!stripe || !elements || submitting) {
      return;
    }

    setSubmitting(true);
    setStatus('Preparing…');

    try {
      const { data: created } = await createSetupIntent();
      const clientSecret = created?.createDesyncSetupIntent?.clientSecret;
      const setupIntentId = created?.createDesyncSetupIntent?.setupIntentId;

      if (!clientSecret || !setupIntentId) {
        throw new Error('Could not start the card update. Please try again.');
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

      setStatus('Saving…');
      const { data: saved } = await setDefaultCard({ variables: { setupIntentId } });
      const res = saved?.setDesyncDefaultCard;

      enqueueToast({
        children: res?.message ?? 'Your card has been updated.',
        variant: res?.success ? 'success' : 'error',
      });

      setSubmitting(false);
      setStatus('');
      if (res?.success) {
        card.clear();
        onDone?.();
      }
    } catch (error) {
      setSubmitting(false);
      setStatus('');
      enqueueToast({
        children:
          error instanceof Error ? error.message : 'Could not update your card.',
        variant: 'error',
      });
    }
  };

  return (
    <StyledForm>
      <StyledCardBox>
        <CardElement options={{ hidePostalCode: true, style: cardElementStyle }} />
      </StyledCardBox>

      {status !== '' && <StyledStatus>{status}</StyledStatus>}

      <MainButton onClick={handleUpdate} disabled={!stripe || submitting}>
        {submitting ? 'Saving…' : 'Update card'}
      </MainButton>
    </StyledForm>
  );
};
