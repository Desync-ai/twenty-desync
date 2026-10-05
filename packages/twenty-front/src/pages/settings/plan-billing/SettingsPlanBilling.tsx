import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMemo, useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Section } from 'twenty-ui/primitives/layout';
import { H2Title } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  DesyncCheckoutForm,
  type DesyncPlan,
} from '@/desync-onboarding/components/DesyncCheckoutForm';
import { DesyncPlanCard } from '@/desync-onboarding/components/DesyncPlanCard';
import { DesyncTeamSeats } from '@/desync-onboarding/components/DesyncTeamSeats';
import { DesyncUpdateCardForm } from '@/desync-onboarding/components/DesyncUpdateCardForm';
import {
  CANCEL_DESYNC_SUBSCRIPTION,
  CHANGE_DESYNC_PLAN,
  DESYNC_BILLING_PLANS_QUERY,
  MY_SUBSCRIPTION_QUERY,
  RESUME_DESYNC_SUBSCRIPTION,
} from '@/desync-onboarding/graphql/desyncBilling';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { UserOrMetadataLoader } from '~/loading/components/UserOrMetadataLoader';

// Desync: the in-CRM "Plan & Billing" page. Driven by the PLAN (is_paid_plan), not
// Stripe state: a Referral has never paid → always the open checkout; a current
// paid plan → the manage view (upgrade-only plan cards, change card, cancel). An
// upgrade follows the lead-gen flow exactly (new sub at full price, quota
// carryover, old sub canceled). Cancellation is at period end (access + workspace
// kept until paid-through) and requires typing "cancel".

type SubscriptionStatus = {
  hasSubscription: boolean;
  planLevel: string | null;
  isPaidPlan: boolean;
  current: boolean;
  cadence: string | null;
  periodEnd: number | null;
  quota: number | null;
  used: number | null;
  aiCostCents: number | null;
  aiCostQuotaCents: number | null;
  stripeActive: boolean;
  cancelAtPeriodEnd: boolean;
  isInternal: boolean;
};

const CANCEL_MODAL_ID = 'desync-cancel-subscription-modal';

// Tiers for upgrade filtering (mirrors the backend PLAN_RANK). Admin/Enterprise
// sit above Pro, so there's nothing to upgrade to.
const PLAN_RANK: Record<string, number> = {
  Starter: 1,
  Crusader: 2,
  Pro: 3,
  Admin: 99,
  Enterprise: 99,
};

const StyledCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledRow = styled.div`
  align-items: baseline;
  display: flex;
  justify-content: space-between;
`;

const StyledPlanTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledChip = styled.span<{ tone: 'active' | 'warn' | 'muted' }>`
  background: ${({ tone }) =>
    tone === 'active'
      ? themeCssVariables.tag.background.green
      : tone === 'warn'
        ? themeCssVariables.tag.background.orange
        : themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ tone }) =>
    tone === 'active'
      ? themeCssVariables.tag.text.green
      : tone === 'warn'
        ? themeCssVariables.tag.text.orange
        : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledMeta = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledManageStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTextButton = styled.button<{ danger?: boolean }>`
  background: transparent;
  border: 1px solid
    ${({ danger }) =>
      danger ? themeCssVariables.border.color.danger : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ danger }) =>
    danger ? themeCssVariables.font.color.danger : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
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

const StyledPlanGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const formatDate = (epochSeconds: number | null): string => {
  if (epochSeconds == null) {
    return '';
  }
  try {
    return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

const planDisplayName = (planLevel: string | null): string =>
  planLevel && planLevel.trim() !== '' ? planLevel : 'Free';

export const SettingsPlanBilling = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal } = useModal();

  const {
    data: subData,
    loading: subLoading,
    refetch: refetchSub,
  } = useQuery<{ mySubscription: SubscriptionStatus }>(MY_SUBSCRIPTION_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const { data: plansData } = useQuery(DESYNC_BILLING_PLANS_QUERY);

  const [cancelSubscription, { loading: cancelling }] = useMutation(
    CANCEL_DESYNC_SUBSCRIPTION,
  );
  const [resumeSubscription, { loading: resuming }] = useMutation(
    RESUME_DESYNC_SUBSCRIPTION,
  );
  const [changePlan, { loading: changing }] = useMutation(CHANGE_DESYNC_PLAN);

  const [pickAnnual, setPickAnnual] = useState(false);
  const [pickedKey, setPickedKey] = useState('');
  const [showUpdateCard, setShowUpdateCard] = useState(false);

  const plans: DesyncPlan[] = plansData?.desyncBillingPlans?.plans ?? [];
  const publishableKey: string | undefined =
    plansData?.desyncBillingPlans?.publishableKey;
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  const permissionMap = usePermissionFlagMap();
  // CRM workspace ADMIN (can manage members) — NOT a Desync admin. Only they can
  // buy/pay for other members' seats; regular members manage only their own plan.
  const canManageMembers = permissionMap[PermissionFlagType.WORKSPACE_MEMBERS] === true;

  const sub = subData?.mySubscription;
  const isInternal = sub?.isInternal === true;
  // Drive the UI off the PLAN, not Stripe state: a Referral has never paid, so
  // they always get the subscribe flow; a current paid plan gets the manage view.
  const isActivePaid = sub?.isPaidPlan === true && sub?.current === true;
  // Internal Desync admins (plan_level Admin) have full access — treat as a full
  // plan, never "subscribe to unlock".
  const isFullAccess = isInternal || sub?.planLevel === 'Admin';

  if (subLoading && subData === undefined) {
    return <UserOrMetadataLoader />;
  }

  const busy = cancelling || resuming || changing;

  const handleCancel = async () => {
    const { data } = await cancelSubscription();
    const res = data?.cancelDesyncSubscription;
    enqueueToast({
      children: res?.message ?? t`Something went wrong.`,
      variant: res?.success ? 'success' : 'error',
    });
    if (res?.success) {
      await refetchSub();
    }
  };

  const handleResume = async () => {
    const { data } = await resumeSubscription();
    const res = data?.resumeDesyncSubscription;
    enqueueToast({
      children: res?.message ?? t`Something went wrong.`,
      variant: res?.success ? 'success' : 'error',
    });
    if (res?.success) {
      await refetchSub();
    }
  };

  const handleChangePlan = async (priceId: string) => {
    const prevLevel = sub?.planLevel;
    const prevCadence = sub?.cadence;
    const { data } = await changePlan({ variables: { priceId } });
    const res = data?.changeDesyncPlan;
    enqueueToast({
      children: res?.success
        ? t`Your plan is updating. It may take a few seconds to reflect here.`
        : (res?.message ?? t`Something went wrong.`),
      variant: res?.success ? 'success' : 'error',
    });
    if (res?.success) {
      setPickedKey('');
      // Poll until the new plan is actually reflected so the page updates itself
      // — no manual refresh — even if the backend takes a moment to settle.
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const { data: fresh } = await refetchSub();
        const s = fresh?.mySubscription;
        if (s && (s.planLevel !== prevLevel || s.cadence !== prevCadence)) {
          break;
        }
      }
    }
  };

  // --- Status chip ------------------------------------------------------------
  let chip: { tone: 'active' | 'warn' | 'muted'; label: string };
  if (isInternal || sub?.planLevel === 'Admin') {
    chip = { tone: 'active', label: t`Internal` };
  } else if (!sub?.hasSubscription) {
    chip = { tone: 'muted', label: t`No plan` };
  } else if (!sub?.current) {
    chip = { tone: 'warn', label: t`Expired` };
  } else if (sub?.cancelAtPeriodEnd) {
    chip = { tone: 'warn', label: t`Cancels soon` };
  } else {
    chip = { tone: 'active', label: t`Active` };
  }

  // Upgrade-only options for a current paid plan: a higher tier, or the annual
  // version of the current tier when currently monthly (never a downgrade, and
  // annual subscribers can't switch to monthly).
  const curRank = PLAN_RANK[sub?.planLevel ?? ''] ?? 0;
  const curAnnual = sub?.cadence === 'annual';
  const effectiveAnnual = curAnnual ? true : pickAnnual;
  const upgradePlans = plans.filter((p) => {
    const r = PLAN_RANK[p.name] ?? 0;
    return effectiveAnnual ? r > curRank || (r === curRank && !curAnnual) : r > curRank;
  });

  const renderActions = () => {
    // Internal / admin: no self-serve billing.
    if (isInternal || sub?.planLevel === 'Admin') {
      return (
        <StyledMeta>
          <Trans>
            This is an internal Desync account with unlimited access. No billing
            actions apply.
          </Trans>
        </StyledMeta>
      );
    }

    // Current paid plan → manage it: upgrade (always open), change card, cancel.
    if (isActivePaid) {
      const selectedPlan = upgradePlans.find((p) => p.key === pickedKey);
      return (
        <StyledManageStack>
          {upgradePlans.length > 0 ? (
            <>
              {!curAnnual && (
                <StyledToggleRow>
                  <StyledToggleButton
                    active={!pickAnnual}
                    onClick={() => setPickAnnual(false)}
                  >
                    {t`Monthly`}
                  </StyledToggleButton>
                  <StyledToggleButton
                    active={pickAnnual}
                    onClick={() => setPickAnnual(true)}
                  >
                    {t`Annual (save 10%)`}
                  </StyledToggleButton>
                </StyledToggleRow>
              )}
              <StyledPlanGrid>
                {upgradePlans.map((p) => (
                  <DesyncPlanCard
                    key={p.key}
                    plan={p}
                    annual={effectiveAnnual}
                    selected={p.key === pickedKey}
                    onSelect={() => setPickedKey(p.key)}
                  />
                ))}
              </StyledPlanGrid>
              <MainButton
                onClick={() => {
                  if (!selectedPlan) {
                    return;
                  }
                  void handleChangePlan(
                    effectiveAnnual
                      ? selectedPlan.priceIdAnnual
                      : selectedPlan.priceIdMonthly,
                  );
                }}
                disabled={busy || !selectedPlan}
              >
                {changing
                  ? t`Updating…`
                  : selectedPlan
                    ? t`Upgrade to ${selectedPlan.name}`
                    : t`Select a plan`}
              </MainButton>
            </>
          ) : (
            <StyledMeta>
              <Trans>You’re on our top plan. Thank you!</Trans>
            </StyledMeta>
          )}

          <StyledActions>
            <StyledTextButton
              onClick={() => setShowUpdateCard((v) => !v)}
              disabled={busy}
            >
              {showUpdateCard ? t`Close` : t`Change payment method`}
            </StyledTextButton>
            {sub?.cancelAtPeriodEnd ? (
              <MainButton onClick={handleResume} disabled={busy}>
                {resuming ? t`Resuming…` : t`Resume plan`}
              </MainButton>
            ) : (
              <StyledTextButton
                danger
                onClick={() => openModal(CANCEL_MODAL_ID)}
                disabled={busy}
              >
                {t`Cancel plan`}
              </StyledTextButton>
            )}
          </StyledActions>

          {showUpdateCard && stripePromise !== null && (
            <Elements stripe={stripePromise}>
              <DesyncUpdateCardForm
                onDone={() => {
                  setShowUpdateCard(false);
                  void refetchSub();
                }}
              />
            </Elements>
          )}
        </StyledManageStack>
      );
    }

    // Referral / Trial / free / expired → never paid (or lapsed): show the card
    // checkout IMMEDIATELY so paying is one step.
    return stripePromise !== null ? (
      <Elements stripe={stripePromise}>
        <DesyncCheckoutForm plans={plans} onComplete={() => refetchSub()} />
      </Elements>
    ) : (
      <StyledMeta>
        <Trans>Billing isn’t configured on this environment.</Trans>
      </StyledMeta>
    );
  };

  const quotaKnown =
    sub?.quota != null && sub.quota >= 0 && sub?.used != null && sub.used >= 0;

  const usedStr = (sub?.used ?? 0).toLocaleString();
  const quotaStr = (sub?.quota ?? 0).toLocaleString();
  const periodEndStr = formatDate(sub?.periodEnd ?? null);

  // AI $ budget spent this period. Hidden for internal/Admin (unlimited) and for
  // plans with no AI allowance (Trial/Referral = 0). Metered per copilot run.
  const aiQuotaCents = sub?.aiCostQuotaCents ?? 0;
  const aiUsedCents = sub?.aiCostCents ?? 0;
  const aiKnown =
    !isInternal && sub?.planLevel !== 'Admin' && aiQuotaCents > 0;
  const aiPct = aiKnown
    ? Math.min(100, Math.round((aiUsedCents / aiQuotaCents) * 100))
    : 0;
  const aiUsedDollars = (aiUsedCents / 100).toFixed(2);
  const aiQuotaDollars = (aiQuotaCents / 100).toFixed(2);

  return (
    <SettingsPageLayout
      title={t`Plan & Billing`}
      links={[{ children: <Trans>Plan & Billing</Trans> }]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Your plan`}
            description={t`Manage your Desync subscription, billing cadence, and usage.`}
          />
          <StyledCard>
            <StyledRow>
              <StyledPlanTitle>{planDisplayName(sub?.planLevel ?? null)}</StyledPlanTitle>
              <StyledChip tone={chip.tone}>{chip.label}</StyledChip>
            </StyledRow>

            {sub?.cadence && isActivePaid && (
              <StyledMeta>
                {sub.cadence === 'annual' ? t`Billed annually` : t`Billed monthly`}
              </StyledMeta>
            )}

            {sub?.periodEnd != null && !isInternal && sub?.planLevel !== 'Admin' && (
              <StyledMeta>
                {sub.cancelAtPeriodEnd
                  ? t`Access ends on ${periodEndStr}`
                  : sub.current
                    ? t`Renews on ${periodEndStr}`
                    : t`Expired on ${periodEndStr}`}
              </StyledMeta>
            )}

            {quotaKnown && (
              <StyledMeta>
                {t`${usedStr} of ${quotaStr} leads used this period`}
              </StyledMeta>
            )}

            {aiKnown && (
              <StyledMeta>
                {t`AI usage: ${aiPct}% — $${aiUsedDollars} of $${aiQuotaDollars} this period`}
              </StyledMeta>
            )}
          </StyledCard>
        </Section>

        <Section>
          <H2Title
            title={
              isFullAccess
                ? t`Your plan`
                : isActivePaid
                  ? t`Upgrade your plan`
                  : t`Choose a plan`
            }
            description={
              isFullAccess
                ? t`Your account has full access to the CRM.`
                : isActivePaid
                  ? t`Upgrade for more records and features. Your leftover records carry over, and you’re charged the new plan’s price right away.`
                  : t`Subscribe to unlock the full CRM. Annual plans save 10%.`
            }
          />
          {renderActions()}
        </Section>

        {canManageMembers && (
          <Section>
            <H2Title
              title={t`Team members`}
              description={t`As a workspace admin you can pay for a teammate’s plan (charged to your card) and invite them. Each seat is its own subscription you can cancel anytime.`}
            />
            <DesyncTeamSeats />
          </Section>
        )}
      </SettingsPageContainer>

      <ConfirmationModal
        modalInstanceId={CANCEL_MODAL_ID}
        title={t`Cancel subscription`}
        subtitle={
          <Trans>
            You’ll keep access, and your workspace, until the end of the period
            you’ve already paid for. Type <b>cancel</b> to confirm.
          </Trans>
        }
        confirmationValue="cancel"
        confirmationPlaceholder={t`Type cancel`}
        confirmButtonText={t`Cancel subscription`}
        onConfirmClick={handleCancel}
      />
    </SettingsPageLayout>
  );
};
