import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMemo, useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { type DesyncPlan } from '@/desync-onboarding/components/DesyncCheckoutForm';
import {
  SeatCheckoutModal,
  type SeatRole,
  type SeatTarget,
} from '@/desync-onboarding/components/SeatCheckoutModal';
import {
  CANCEL_DESYNC_SEAT,
  DESYNC_BILLING_PLANS_QUERY,
  DESYNC_GET_ROLES,
  DESYNC_MEMBER_PLANS_QUERY,
  DESYNC_SEAT_PAYMENT_METHOD_QUERY,
  MY_DESYNC_SEATS_QUERY,
} from '@/desync-onboarding/graphql/desyncBilling';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

// Desync: "Team members" — a workspace admin sees every member (name, email,
// current plan) and can buy/pay a per-seat subscription for any of them, or invite
// a brand-new teammate. The purchase itself is a focused modal (SeatCheckoutModal).

const SEAT_MODAL_ID = 'desync-seat-checkout-modal';
const CANCEL_SEAT_MODAL_ID = 'desync-cancel-seat-modal';

type Seat = {
  subscriptionId: string;
  beneficiaryEmail: string | null;
  role: string | null;
  status: string;
  planName: string | null;
  cancelAtPeriodEnd: boolean;
  periodEnd: number | null;
};

const StyledWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRow = styled.div`
  align-items: center;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledWhoCol = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledSub = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledSubhead = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin-top: ${themeCssVariables.spacing[2]};
`;

const StyledMeta = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledActionButton = styled.button<{ danger?: boolean }>`
  background: transparent;
  border: 1px solid
    ${({ danger }) =>
      danger ? themeCssVariables.border.color.danger : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ danger }) =>
    danger ? themeCssVariables.font.color.danger : themeCssVariables.font.color.secondary};
  cursor: pointer;
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledSeatTag = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  flex-shrink: 0;
`;

const StyledActions = styled.div`
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
`;

// plan_level values that mean the member is on a PAID plan (so if it isn't a seat
// this admin pays, it's self-managed and hands-off).
const PAID_PLANS = new Set(['Starter', 'Crusader', 'Pro', 'Admin', 'Enterprise']);

const isNonEmpty = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim() !== '';

export const DesyncTeamSeats = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal } = useModal();
  const currentUser = useAtomStateValue(currentUserState);
  const members = useAtomStateValue(currentWorkspaceMembersState);

  const myEmail = (currentUser?.email ?? '').toLowerCase();
  const otherMembers = (members ?? []).filter(
    (m) => (m.userEmail ?? '').toLowerCase() !== myEmail,
  );
  const memberEmails = otherMembers
    .map((m) => m.userEmail ?? '')
    .filter((e) => e !== '');

  const { data: seatsData, refetch: refetchSeats } = useQuery<{ myDesyncSeats: Seat[] }>(
    MY_DESYNC_SEATS_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: plansData } = useQuery(DESYNC_BILLING_PLANS_QUERY);
  const { data: pmData } = useQuery(DESYNC_SEAT_PAYMENT_METHOD_QUERY, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: memberPlansData, refetch: refetchMemberPlans } = useQuery(
    DESYNC_MEMBER_PLANS_QUERY,
    {
      variables: { emails: memberEmails },
      skip: memberEmails.length === 0,
      fetchPolicy: 'cache-and-network',
    },
  );
  const { data: rolesData } = useQuery(DESYNC_GET_ROLES);

  const [cancelSeat, { loading: cancelling }] = useMutation(CANCEL_DESYNC_SEAT);
  const [target, setTarget] = useState<SeatTarget>({
    email: '',
    isMember: false,
    isUpgrade: false,
    currentPlan: null,
    currentCadence: null,
  });
  const [nonce, setNonce] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<{
    subscriptionId: string;
    label: string;
  } | null>(null);

  const plans: DesyncPlan[] = plansData?.desyncBillingPlans?.plans ?? [];
  const publishableKey: string | undefined =
    plansData?.desyncBillingPlans?.publishableKey;
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const pm = {
    hasCard: pmData?.desyncSeatPaymentMethod?.hasCard === true,
    brand: pmData?.desyncSeatPaymentMethod?.brand ?? null,
    last4: pmData?.desyncSeatPaymentMethod?.last4 ?? null,
  };
  const seats: Seat[] = seatsData?.myDesyncSeats ?? [];
  const roles: SeatRole[] = rolesData?.getRoles ?? [];

  const seatByEmail = new Map(
    seats
      .filter((s) => isNonEmpty(s.beneficiaryEmail))
      .map((s) => [(s.beneficiaryEmail as string).toLowerCase(), s]),
  );
  const planByEmail = new Map<
    string,
    { planLevel: string | null; cadence: string | null }
  >(
    (memberPlansData?.desyncMemberPlans ?? []).map(
      (p: { email: string; planLevel: string | null; cadence: string | null }) => [
        p.email.toLowerCase(),
        { planLevel: p.planLevel, cadence: p.cadence },
      ],
    ),
  );

  const openSeatModal = (
    email: string,
    isMember: boolean,
    isUpgrade: boolean,
    currentPlan: string | null,
    currentCadence: string | null,
  ) => {
    setTarget({ email, isMember, isUpgrade, currentPlan, currentCadence });
    setNonce((n) => n + 1);
    openModal(SEAT_MODAL_ID);
  };

  const refreshAll = () => {
    void refetchSeats();
    if (memberEmails.length > 0) {
      void refetchMemberPlans();
    }
  };

  // A seat's rows are provisioned asynchronously by the Stripe webhook a few
  // seconds after the charge, so poll a handful of times to reflect the new plan
  // in the list without a manual refresh.
  const refreshWithPolling = () => {
    refreshAll();
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      refreshAll();
      if (ticks >= 5) {
        clearInterval(id);
      }
    }, 3000);
  };

  // Destructive — require a type-"cancel"-to-confirm modal rather than one press.
  const requestCancelSeat = (subscriptionId: string, label: string) => {
    setCancelTarget({ subscriptionId, label });
    openModal(CANCEL_SEAT_MODAL_ID);
  };

  const handleCancelSeat = async (subscriptionId: string) => {
    const { data } = await cancelSeat({ variables: { subscriptionId } });
    const res = data?.cancelDesyncSeat;
    enqueueToast({
      children: res?.message ?? t`Something went wrong.`,
      variant: res?.success ? 'success' : 'error',
    });
    if (res?.success) {
      refreshAll();
    }
  };

  const memberEmailSet = new Set(memberEmails.map((e) => e.toLowerCase()));
  const pendingSeats = seats.filter(
    (s) =>
      isNonEmpty(s.beneficiaryEmail) &&
      !memberEmailSet.has((s.beneficiaryEmail as string).toLowerCase()),
  );

  const renderMemberAction = (
    memberEmail: string,
    planInfo: { planLevel: string | null; cadence: string | null } | undefined,
  ) => {
    const seat = seatByEmail.get(memberEmail.toLowerCase());
    // A seat THIS admin pays → they can upgrade it or cancel it.
    if (seat) {
      if (seat.cancelAtPeriodEnd) {
        return <StyledSeatTag>{t`seat cancels soon`}</StyledSeatTag>;
      }
      return (
        <StyledActions>
          <StyledActionButton
            onClick={() =>
              openSeatModal(
                memberEmail,
                true,
                true,
                planInfo?.planLevel ?? null,
                planInfo?.cadence ?? null,
              )
            }
          >
            {t`Upgrade`}
          </StyledActionButton>
          <StyledActionButton
            danger
            onClick={() => requestCancelSeat(seat.subscriptionId, memberEmail)}
            disabled={cancelling}
          >
            {t`Cancel seat`}
          </StyledActionButton>
        </StyledActions>
      );
    }
    // On a paid plan that ISN'T a seat you pay (they pay, or another admin does)
    // → hands off. You can never touch someone else's own subscription.
    const level = planInfo?.planLevel ?? null;
    if (level && PAID_PLANS.has(level)) {
      return <StyledSeatTag>{t`self-managed`}</StyledSeatTag>;
    }
    // Free / no plan → buy them a first seat.
    return (
      <StyledActionButton
        onClick={() =>
          openSeatModal(memberEmail, true, false, level, planInfo?.cadence ?? null)
        }
      >
        {t`Buy seat`}
      </StyledActionButton>
    );
  };

  return (
    <StyledWrap>
      {otherMembers.length > 0 ? (
        otherMembers.map((m) => {
          const memberEmail = m.userEmail ?? '';
          const fullName = [m.name?.firstName, m.name?.lastName]
            .filter(Boolean)
            .join(' ');
          const seat = seatByEmail.get(memberEmail.toLowerCase());
          const planInfo = planByEmail.get(memberEmail.toLowerCase());
          const planLabel = seat?.planName
            ? t`${seat.planName} · you pay`
            : planInfo?.planLevel || t`No plan`;
          return (
            <StyledRow key={m.id}>
              <StyledWhoCol>
                <StyledName>{fullName || memberEmail || t`Member`}</StyledName>
                <StyledSub>
                  {memberEmail}
                  {` · ${planLabel}`}
                </StyledSub>
              </StyledWhoCol>
              {renderMemberAction(memberEmail, planInfo)}
            </StyledRow>
          );
        })
      ) : (
        <StyledMeta>
          <Trans>No other members in this workspace yet.</Trans>
        </StyledMeta>
      )}

      {pendingSeats.length > 0 && (
        <>
          <StyledSubhead>
            <Trans>Invited (seat active when they join)</Trans>
          </StyledSubhead>
          {pendingSeats.map((s) => (
            <StyledRow key={s.subscriptionId}>
              <StyledWhoCol>
                <StyledName>{s.beneficiaryEmail}</StyledName>
                <StyledSub>
                  {s.planName ?? ''}
                  {s.cancelAtPeriodEnd ? ` · ${t`cancels soon`}` : ''}
                </StyledSub>
              </StyledWhoCol>
              {!s.cancelAtPeriodEnd && (
                <StyledActionButton
                  danger
                  onClick={() =>
                    requestCancelSeat(s.subscriptionId, s.beneficiaryEmail ?? '')
                  }
                  disabled={cancelling}
                >
                  {t`Cancel seat`}
                </StyledActionButton>
              )}
            </StyledRow>
          ))}
        </>
      )}

      <div>
        <MainButton onClick={() => openSeatModal('', false, false, null, null)}>
          {t`Add a teammate`}
        </MainButton>
      </div>

      {stripePromise !== null ? (
        <Elements stripe={stripePromise}>
          <SeatCheckoutModal
            key={nonce}
            modalId={SEAT_MODAL_ID}
            target={target}
            plans={plans}
            pm={pm}
            roles={roles}
            onDone={refreshWithPolling}
          />
        </Elements>
      ) : (
        <StyledMeta>
          <Trans>Billing isn’t configured on this environment.</Trans>
        </StyledMeta>
      )}

      <ConfirmationModal
        modalInstanceId={CANCEL_SEAT_MODAL_ID}
        title={t`Cancel this seat?`}
        subtitle={
          <>
            {t`This cancels the paid seat at the end of its current billing period — they keep access until then.`}
            {cancelTarget?.label ? ` (${cancelTarget.label})` : ''}
            {' '}
            {t`Type "cancel" to confirm.`}
          </>
        }
        confirmationValue={t`cancel`}
        confirmationPlaceholder={t`cancel`}
        confirmButtonText={t`Cancel seat`}
        loading={cancelling}
        onConfirmClick={() => {
          if (cancelTarget) {
            void handleCancelSeat(cancelTarget.subscriptionId);
          }
          setCancelTarget(null);
        }}
        onClose={() => setCancelTarget(null)}
      />
    </StyledWrap>
  );
};
