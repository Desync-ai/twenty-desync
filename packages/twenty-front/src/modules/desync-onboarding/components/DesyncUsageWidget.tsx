import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { ProgressBar } from 'twenty-ui/primitives/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { MY_SUBSCRIPTION_QUERY } from '@/desync-onboarding/graphql/desyncBilling';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

// Desync: a compact "plan + usage" card pinned to the bottom of the main app nav
// drawer — plan + renewal, leads generated this cycle (n / N), and AI budget
// spent (%). Mirrors the lead-gen sidebar meters so a user sees the same Desync
// plan status inside the CRM. Reads only the mySubscription query (leads quota +
// AI $ budget both live on the shared subscription_usage row; AI is metered per
// CRM-copilot run via the backend /ai/record path, so the % is real). The whole
// card routes to Plan & Billing on click.

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
  cancelAtPeriodEnd: boolean;
  isInternal: boolean;
};

type ChipTone = 'active' | 'warn' | 'muted';

const StyledCard = styled.button`
  background: transparent;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: left;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
  }
`;

const StyledHeaderRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledPlanName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledChip = styled.span<{ tone: ChipTone }>`
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
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: 0 ${themeCssVariables.spacing[1]};
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledMeter = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledMeterRow = styled.div`
  align-items: baseline;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  justify-content: space-between;
`;

const StyledMeterValue = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

const formatDate = (epochSeconds: number | null): string => {
  if (epochSeconds == null) {
    return '';
  }
  try {
    return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

export const DesyncUsageWidget = () => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();

  const { data: subData } = useQuery<{ mySubscription: SubscriptionStatus }>(
    MY_SUBSCRIPTION_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );

  const sub = subData?.mySubscription;
  // Render nothing until the subscription is known: keeps the footer clean and
  // avoids a flash of an empty card. The entitlement gate guarantees an entitled
  // viewer, so a usage row exists.
  if (sub === undefined) {
    return null;
  }

  const isFullAccess = sub.isInternal || sub.planLevel === 'Admin';
  const planName =
    sub.planLevel != null && sub.planLevel.trim() !== ''
      ? sub.planLevel
      : t`Free`;

  // --- status chip ---
  let chip: { tone: ChipTone; label: string };
  if (isFullAccess) {
    chip = { tone: 'active', label: t`Internal` };
  } else if (!sub.hasSubscription) {
    chip = { tone: 'muted', label: t`No plan` };
  } else if (!sub.current) {
    chip = { tone: 'warn', label: t`Expired` };
  } else if (sub.cancelAtPeriodEnd) {
    chip = { tone: 'warn', label: t`Cancels soon` };
  } else {
    chip = { tone: 'active', label: t`Active` };
  }

  // --- renewal meta ---
  const dateStr = formatDate(sub.periodEnd);
  let meta = '';
  if (dateStr !== '') {
    if (sub.cancelAtPeriodEnd) {
      meta = t`Cancels ${dateStr}`;
    } else if (sub.current) {
      meta = t`Renews ${dateStr}`;
    } else {
      meta = t`Until ${dateStr}`;
    }
  }

  // --- leads generated this cycle (bar fills as leads are used; n / N) ---
  const quota = sub.quota ?? 0;
  const used = sub.used ?? 0;
  const showLeads = !isFullAccess && quota > 0;
  const leadsPct = showLeads ? clampPct((used / quota) * 100) : 0;

  // --- AI budget spent this cycle (percent of the $ allowance used) ---
  const aiQuota = sub.aiCostQuotaCents ?? 0;
  const aiUsed = sub.aiCostCents ?? 0;
  const showAi = !isFullAccess && aiQuota > 0;
  const aiPct = showAi ? clampPct((aiUsed / aiQuota) * 100) : 0;

  return (
    <StyledCard
      type="button"
      onClick={() => navigateSettings(SettingsPath.PlanBilling)}
      aria-label={t`Plan and usage`}
    >
      <StyledHeaderRow>
        <StyledPlanName>{planName}</StyledPlanName>
        <StyledChip tone={chip.tone}>{chip.label}</StyledChip>
      </StyledHeaderRow>
      {meta !== '' && <StyledMeta>{meta}</StyledMeta>}

      {showLeads && (
        <StyledMeter>
          <StyledMeterRow>
            <span>{t`Leads`}</span>
            <StyledMeterValue>
              {used.toLocaleString()} / {quota.toLocaleString()}
            </StyledMeterValue>
          </StyledMeterRow>
          <ProgressBar
            value={leadsPct}
            backgroundColor={themeCssVariables.background.tertiary}
            barColor={
              leadsPct >= 90
                ? themeCssVariables.color.red9
                : themeCssVariables.color.green9
            }
            withBorderRadius
            ariaLabel={t`Leads generated this cycle`}
          />
        </StyledMeter>
      )}

      {showAi && (
        <StyledMeter>
          <StyledMeterRow>
            <span>{t`AI usage`}</span>
            <StyledMeterValue>{Math.round(aiPct)}%</StyledMeterValue>
          </StyledMeterRow>
          <ProgressBar
            value={aiPct}
            backgroundColor={themeCssVariables.background.tertiary}
            barColor={
              aiPct >= 90
                ? themeCssVariables.color.red9
                : themeCssVariables.color.green9
            }
            withBorderRadius
            ariaLabel={t`AI budget used`}
          />
        </StyledMeter>
      )}
    </StyledCard>
  );
};
