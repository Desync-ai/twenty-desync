import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { ProgressBar } from 'twenty-ui/primitives/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import {
  MY_DESYNC_SEATS_QUERY,
  MY_SUBSCRIPTION_QUERY,
} from '@/desync-onboarding/graphql/desyncBilling';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

// Desync: a compact "plan + usage" card pinned to the bottom of the main app nav
// drawer — plan, renewal, leads quota remaining, and (for workspace admins) seats
// claimed vs purchased. Mirrors the meters on the lead-gen sidebar so a user sees
// the same Desync plan status wherever they are. Reads only data the backend
// already exposes (mySubscription + myDesyncSeats) and routes to Plan & Billing on
// click. AI-spend and transcription-minute bars are intentionally omitted: those
// columns exist in subscription_usage but are not read out to the browser yet
// (needs a backend change + the AI-metering decision).

type SubscriptionStatus = {
  hasSubscription: boolean;
  planLevel: string | null;
  isPaidPlan: boolean;
  current: boolean;
  cadence: string | null;
  periodEnd: number | null;
  quota: number | null;
  used: number | null;
  cancelAtPeriodEnd: boolean;
  isInternal: boolean;
};

type Seat = {
  beneficiaryEmail: string | null;
  status: string;
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
  const permissionMap = usePermissionFlagMap();
  const canManageMembers =
    permissionMap[PermissionFlagType.WORKSPACE_MEMBERS] === true;

  const { data: subData } = useQuery<{ mySubscription: SubscriptionStatus }>(
    MY_SUBSCRIPTION_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );
  // Only admins can buy/manage seats, so only they get the seats meter.
  const { data: seatsData } = useQuery<{ myDesyncSeats: Seat[] }>(
    MY_DESYNC_SEATS_QUERY,
    { skip: !canManageMembers, fetchPolicy: 'cache-and-network' },
  );
  const members = useAtomStateValue(currentWorkspaceMembersState);

  const sub = subData?.mySubscription;
  // Render nothing until the subscription is known: keeps the footer clean and
  // avoids a flash of an empty card. The entitlement gate guarantees the viewer
  // is entitled, so a usage row exists.
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

  // --- leads quota (bar depletes to show how much is left) ---
  const showQuota = !isFullAccess && sub.quota != null && sub.quota > 0;
  const quota = sub.quota ?? 0;
  const used = sub.used ?? 0;
  const remaining = Math.max(0, quota - used);
  const remainingPct = showQuota ? clampPct((remaining / quota) * 100) : 0;

  // --- seats (claimed by a current member vs purchased) ---
  const seats = seatsData?.myDesyncSeats ?? [];
  const memberEmailSet = new Set(
    (members ?? [])
      .map((m) => (m.userEmail ?? '').toLowerCase())
      .filter((email) => email !== ''),
  );
  const claimedSeats = seats.filter(
    (seat) =>
      seat.beneficiaryEmail != null &&
      memberEmailSet.has(seat.beneficiaryEmail.toLowerCase()),
  ).length;
  const showSeats = canManageMembers && seats.length > 0;
  const seatsPct = showSeats
    ? clampPct((claimedSeats / seats.length) * 100)
    : 0;

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

      {showQuota && (
        <StyledMeter>
          <StyledMeterRow>
            <span>{t`Leads`}</span>
            <StyledMeterValue>
              {used.toLocaleString()} / {quota.toLocaleString()}
            </StyledMeterValue>
          </StyledMeterRow>
          <ProgressBar
            value={remainingPct}
            backgroundColor={themeCssVariables.background.tertiary}
            barColor={
              remainingPct <= 10
                ? themeCssVariables.color.red9
                : themeCssVariables.color.green9
            }
            withBorderRadius
            ariaLabel={t`Leads remaining`}
          />
        </StyledMeter>
      )}

      {showSeats && (
        <StyledMeter>
          <StyledMeterRow>
            <span>{t`Seats`}</span>
            <StyledMeterValue>
              {claimedSeats} / {seats.length}
            </StyledMeterValue>
          </StyledMeterRow>
          <ProgressBar
            value={seatsPct}
            backgroundColor={themeCssVariables.background.tertiary}
            barColor={themeCssVariables.color.blue}
            withBorderRadius
            ariaLabel={t`Seats used`}
          />
        </StyledMeter>
      )}
    </StyledCard>
  );
};
