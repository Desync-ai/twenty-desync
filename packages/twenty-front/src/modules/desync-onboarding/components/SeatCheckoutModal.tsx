import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { themeCssVariables, useTheme } from 'twenty-ui/theme-constants';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  getStripeCardStyle,
  type DesyncPlan,
} from '@/desync-onboarding/components/DesyncCheckoutForm';
import { DesyncPlanCard } from '@/desync-onboarding/components/DesyncPlanCard';
import {
  BUY_DESYNC_SEAT,
  CHANGE_DESYNC_SEAT_PLAN,
  CREATE_DESYNC_SEAT_SETUP_INTENT,
} from '@/desync-onboarding/graphql/desyncBilling';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useCreateWorkspaceInvitation } from '@/workspace-invitation/hooks/useCreateWorkspaceInvitation';

// Desync: the seat-purchase modal. Buy a seat for a teammate (plan cards +
// monthly/annual + Twenty workspace role) in one dialog. Card on file is
// auto-used (with a "use a different card" option). Plan options are gated to
// UPGRADES of the teammate's current plan (same rule as the owner's own plan:
// higher tier, or annual-of-current-tier when monthly; annual stays annual).

export type SeatRole = { id: string; label: string; canUpdateAllSettings: boolean };
export type SeatPaymentInfo = { hasCard: boolean; brand: string | null; last4: string | null };
export type SeatTarget = {
  email: string;
  isMember: boolean;
  isUpgrade: boolean; // upgrading an existing seat the admin pays (vs a new buy)
  currentPlan: string | null;
  currentCadence: string | null;
};

// Mirrors the backend PLAN_RANK: Admin/Enterprise sit above Pro, so a member on
// one of those has nothing to upgrade to.
const PLAN_RANK: Record<string, number> = {
  Starter: 1,
  Crusader: 2,
  Pro: 3,
  Admin: 99,
  Enterprise: 99,
};

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledFieldLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  width: 100%;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  width: 100%;
`;

const StyledField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledToggleRow = styled.div`
  display: flex;
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
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledPlanRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledCardBox = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledCardOnFile = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledLinkButton = styled.button`
  background: transparent;
  border: none;
  color: ${themeCssVariables.color.blue};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: 0;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const defaultRoleId = (roles: SeatRole[]): string => {
  const member = roles.find((r) => !r.canUpdateAllSettings);
  return member?.id ?? roles[0]?.id ?? '';
};

export const SeatCheckoutModal = ({
  modalId,
  target,
  plans,
  pm,
  roles,
  onDone,
}: {
  modalId: string;
  target: SeatTarget;
  plans: DesyncPlan[];
  pm: SeatPaymentInfo;
  roles: SeatRole[];
  onDone: () => void;
}) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { closeModal } = useModal();
  const stripe = useStripe();
  const elements = useElements();
  const theme = useTheme();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { sendInvitation } = useCreateWorkspaceInvitation();

  const [buySeat] = useMutation(BUY_DESYNC_SEAT);
  const [createSeatSetupIntent] = useMutation(CREATE_DESYNC_SEAT_SETUP_INTENT);
  const [changeSeatPlan] = useMutation(CHANGE_DESYNC_SEAT_PLAN);

  // Upgrade gating off the teammate's CURRENT plan (same rule as own-plan).
  const curRank = target.currentPlan ? (PLAN_RANK[target.currentPlan] ?? 0) : 0;
  const curAnnual = target.currentCadence === 'annual';
  const gated = curRank > 0;
  const forceAnnual = gated && curAnnual; // annual subscribers: annual only

  const optsFor = (useAnnual: boolean) =>
    gated
      ? plans.filter((p) => {
          const r = PLAN_RANK[p.name] ?? 0;
          return useAnnual ? r > curRank || (r === curRank && !curAnnual) : r > curRank;
        })
      : plans;
  const monthlyOpts = optsFor(false);
  const annualOpts = optsFor(true); // annual ⊇ monthly for upgrades
  const noUpgrade = gated && annualOpts.length === 0; // truly at the top
  // When the only upgrades are annual (e.g. Pro monthly → Pro annual), force the
  // annual tab so the option is reachable instead of showing "top plan".
  const onlyAnnual = forceAnnual || (gated && monthlyOpts.length === 0);

  const [email, setEmail] = useState(target.email);
  const [annual, setAnnual] = useState(onlyAnnual);
  const [planKey, setPlanKey] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId(roles));
  const [useNewCard, setUseNewCard] = useState(!pm.hasCard);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');

  const effectiveAnnual = onlyAnnual ? true : annual;
  const availablePlans = effectiveAnnual ? annualOpts : monthlyOpts;
  const selectedPlan =
    availablePlans.find((p) => p.key === planKey) ?? availablePlans[0];
  const showToggle = !onlyAnnual && monthlyOpts.length > 0 && annualOpts.length > 0;

  const workspaceId = currentWorkspace?.id ?? '';
  const isMember = target.isMember;
  const isUpgrade = target.isUpgrade;

  const handleBuy = async () => {
    const beneficiary = email.trim().toLowerCase();
    if (!beneficiary || !selectedPlan || submitting) {
      return;
    }
    if (!workspaceId) {
      enqueueToast({ children: t`Open a workspace first.`, variant: 'error' });
      return;
    }
    const priceId = effectiveAnnual
      ? selectedPlan.priceIdAnnual
      : selectedPlan.priceIdMonthly;

    setSubmitting(true);
    try {
      // Upgrading an existing seat the admin pays for: change the seat's plan
      // server-side (new sub + cancel old), reusing the seat's card. No invite.
      if (isUpgrade) {
        setStatusText('Upgrading seat…');
        const { data } = await changeSeatPlan({
          variables: { beneficiaryEmail: email.trim().toLowerCase(), priceId },
        });
        const res = data?.changeDesyncSeatPlan;
        if (!res?.success) {
          enqueueToast({
            children: res?.message ?? t`Could not upgrade the seat.`,
            variant: 'error',
          });
          setSubmitting(false);
          setStatusText('');
          return;
        }
        enqueueToast({
          children: res?.message ?? t`The seat has been upgraded.`,
          variant: 'success',
        });
        setSubmitting(false);
        setStatusText('');
        closeModal(modalId);
        onDone();
        return;
      }

      let setupIntentId: string | null = null;
      // Only run the SetupIntent dance when entering a NEW card; otherwise the
      // seat is charged to the card already on file.
      if (useNewCard) {
        if (!stripe || !elements) {
          throw new Error('Card field is not ready.');
        }
        setStatusText('Confirming your card…');
        const { data: created } = await createSeatSetupIntent();
        const clientSecret = created?.createDesyncSeatSetupIntent?.clientSecret;
        setupIntentId = created?.createDesyncSeatSetupIntent?.setupIntentId ?? null;
        const card = elements.getElement(CardElement);
        if (!clientSecret || !setupIntentId || !card) {
          throw new Error('Could not start card setup. Please try again.');
        }
        const result = await stripe.confirmCardSetup(clientSecret, {
          payment_method: { card },
        });
        if (result.error) {
          throw new Error(result.error.message ?? 'Card confirmation failed.');
        }
      }

      setStatusText('Purchasing seat…');
      const { data } = await buySeat({
        variables: {
          priceId,
          beneficiaryEmail: beneficiary,
          workspaceId,
          role: null,
          setupIntentId,
        },
      });
      const res = data?.buyDesyncSeat;
      if (res?.status !== 'active') {
        enqueueToast({
          children: res?.message || t`The payment didn't complete. Try a different card.`,
          variant: 'error',
        });
        setSubmitting(false);
        setStatusText('');
        return;
      }

      if (!isMember) {
        setStatusText('Sending invite…');
        try {
          await sendInvitation({ emails: [beneficiary], roleId: roleId || undefined });
        } catch {
          // Seat is bought regardless; the admin can re-invite from Members.
        }
      }

      enqueueToast({
        children: isMember
          ? t`Seat purchased for ${beneficiary}.`
          : t`Seat purchased and invite sent to ${beneficiary}.`,
        variant: 'success',
      });
      setSubmitting(false);
      setStatusText('');
      closeModal(modalId);
      onDone();
    } catch (error) {
      setSubmitting(false);
      setStatusText('');
      enqueueToast({
        children: error instanceof Error ? error.message : t`Could not buy the seat.`,
        variant: 'error',
      });
    }
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={modalId}
      size="large"
      padding="large"
      isClosable
      renderInDocumentBody
      smallBorderRadius
    >
      <StyledContent>
        <StyledTitle>
          {isUpgrade
            ? t`Upgrade ${target.email}'s seat`
            : isMember
              ? t`Buy a seat for ${target.email}`
              : t`Add a teammate`}
        </StyledTitle>

        {!isMember && (
          <StyledField>
            <StyledFieldLabel>{t`Teammate email`}</StyledFieldLabel>
            <StyledInput
              type="email"
              placeholder={t`teammate@email.com`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </StyledField>
        )}

        {noUpgrade ? (
          <StyledStatus>
            <Trans>This teammate is already on the top plan.</Trans>
          </StyledStatus>
        ) : (
          <>
            <StyledField>
              <StyledFieldLabel>{t`Plan`}</StyledFieldLabel>
              {showToggle && (
                <StyledToggleRow>
                  <StyledToggleButton active={!annual} onClick={() => setAnnual(false)}>
                    {t`Monthly`}
                  </StyledToggleButton>
                  <StyledToggleButton active={annual} onClick={() => setAnnual(true)}>
                    {t`Annual (save 10%)`}
                  </StyledToggleButton>
                </StyledToggleRow>
              )}
              <StyledPlanRow>
                {availablePlans.map((p) => (
                  <DesyncPlanCard
                    key={p.key}
                    plan={p}
                    annual={effectiveAnnual}
                    selected={p.key === selectedPlan?.key}
                    onSelect={() => setPlanKey(p.key)}
                  />
                ))}
              </StyledPlanRow>
            </StyledField>

            {!isMember && roles.length > 0 && (
              <StyledField>
                <StyledFieldLabel>{t`Workspace role`}</StyledFieldLabel>
                <StyledSelect value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </StyledSelect>
              </StyledField>
            )}

            {!isUpgrade && (
            <StyledField>
              <StyledFieldLabel>{t`Card`}</StyledFieldLabel>
              {pm.hasCard && !useNewCard ? (
                <StyledCardOnFile>
                  <span>
                    {pm.brand ? `${pm.brand} ` : ''}
                    •••• {pm.last4 || '••••'}
                  </span>
                  <StyledLinkButton onClick={() => setUseNewCard(true)}>
                    {t`Use a different card`}
                  </StyledLinkButton>
                </StyledCardOnFile>
              ) : (
                <>
                  <StyledCardBox>
                    <CardElement
                      options={{ hidePostalCode: true, style: getStripeCardStyle(theme.name === 'dark') }}
                    />
                  </StyledCardBox>
                  {pm.hasCard && (
                    <StyledLinkButton onClick={() => setUseNewCard(false)}>
                      {t`Use card on file`}
                    </StyledLinkButton>
                  )}
                </>
              )}
            </StyledField>
            )}

            {statusText !== '' && <StyledStatus>{statusText}</StyledStatus>}

            <MainButton
              onClick={handleBuy}
              disabled={submitting || !selectedPlan || email.trim() === ''}
              fullWidth
            >
              {submitting
                ? t`Processing…`
                : isUpgrade
                  ? t`Upgrade to ${selectedPlan?.name ?? ''}`
                  : isMember
                    ? t`Buy seat`
                    : t`Buy & invite`}
            </MainButton>

            <StyledStatus>
              <Trans>
                Each seat is its own subscription on your card, cancel anytime. If
                they’re not on Desync yet, we’ll invite them and the seat activates
                when they join.
              </Trans>
            </StyledStatus>
          </>
        )}
      </StyledContent>
    </ModalStatefulWrapper>
  );
};
