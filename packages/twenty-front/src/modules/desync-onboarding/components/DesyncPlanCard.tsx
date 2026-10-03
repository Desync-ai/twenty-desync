import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type DesyncPlan } from '@/desync-onboarding/components/DesyncCheckoutForm';

// Desync: per-plan marketing copy (badge + feature list), lifted from the lead-gen
// subscribe page so the in-CRM plan cards show WHAT each plan includes. Keyed by
// the catalog plan name; price/records/priceIds come from the live catalog.
export const PLAN_META: Record<string, { badge?: string; features: string[] }> = {
  Starter: {
    features: [
      'CRM access',
      '7 hrs/mo of live call transcription & site building (preview)',
      'AI chat usage included',
      'Manual Search: free-form AI search',
      'Access to all databases',
      'MCP integration',
      'Direct support with outreach',
      'Lookup history and custom tables',
    ],
  },
  Crusader: {
    badge: '50% better than Starter',
    features: [
      'CRM access',
      'Add teammates on paid seats',
      '12.5 hrs/mo of live call transcription & site building',
      '2x more AI chat usage than Starter',
      'Manual Search: free-form AI search',
      'Access to all databases',
      'MCP integration',
      'Direct support with outreach',
      'Bi-weekly calls with team',
      'Referral program',
    ],
  },
  Pro: {
    badge: '2x better than Starter',
    features: [
      'CRM access',
      'Add teammates on paid seats',
      '12.5 hrs/mo of live call transcription & site building',
      '13x more AI chat usage than Starter',
      'Manual Search: free-form AI search',
      'Access to all databases (new databases first)',
      'MCP integration',
      'Direct support with outreach',
      'Bi-weekly calls with team',
      'Referral program',
      'Priority support',
      'Custom requests',
    ],
  },
};

// Annual = 10% off. Returns the big price (monthly-equivalent) + the yearly total.
export const planPricing = (monthlyPriceUsd: number, annual: boolean) => {
  if (!annual) {
    return { big: `$${monthlyPriceUsd.toLocaleString()}`, period: '/mo', subLine: null };
  }
  const yearly = Math.round(monthlyPriceUsd * 12 * 0.9);
  const perMonth = yearly / 12;
  const perMonthStr = Number.isInteger(perMonth)
    ? perMonth.toLocaleString()
    : perMonth.toFixed(2);
  return {
    big: `$${perMonthStr}`,
    period: '/mo',
    subLine: `billed $${yearly.toLocaleString()}/year`,
  };
};

const StyledCard = styled.button<{ selected: boolean }>`
  align-items: stretch;
  background: ${({ selected }) =>
    selected ? themeCssVariables.background.tertiary : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ selected }) =>
      selected ? themeCssVariables.color.blue : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  flex: 1 1 220px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  max-width: 320px;
  min-width: 200px;
  padding: ${themeCssVariables.spacing[4]};
  text-align: left;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.tag.background.blue};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.tag.text.blue};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledPriceRow = styled.div`
  align-items: baseline;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledBigPrice = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledPeriod = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledSubLine = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledRecords = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledDivider = styled.div`
  background: ${themeCssVariables.border.color.light};
  height: 1px;
  margin: ${themeCssVariables.spacing[1]} 0;
  width: 100%;
`;

const StyledFeatures = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledFeature = styled.li`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  line-height: 1.4;
`;

const StyledCheck = styled.span`
  color: ${themeCssVariables.color.blue};
  flex-shrink: 0;
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

type DesyncPlanCardProps = {
  plan: DesyncPlan;
  annual: boolean;
  selected: boolean;
  onSelect: () => void;
};

export const DesyncPlanCard = ({
  plan,
  annual,
  selected,
  onSelect,
}: DesyncPlanCardProps) => {
  const meta = PLAN_META[plan.name] ?? { features: [] };
  const pricing = planPricing(plan.monthlyPriceUsd, annual);

  return (
    <StyledCard type="button" selected={selected} onClick={onSelect}>
      <StyledHeader>
        <StyledName>{plan.name}</StyledName>
        {meta.badge && <StyledBadge>{meta.badge}</StyledBadge>}
      </StyledHeader>

      <StyledPriceRow>
        <StyledBigPrice>{pricing.big}</StyledBigPrice>
        <StyledPeriod>{pricing.period}</StyledPeriod>
      </StyledPriceRow>
      {pricing.subLine && <StyledSubLine>{pricing.subLine}</StyledSubLine>}

      <StyledRecords>
        {plan.recordQuota.toLocaleString()} records / month
      </StyledRecords>

      <StyledDivider />

      <StyledFeatures>
        {meta.features.map((f) => (
          <StyledFeature key={f}>
            <StyledCheck>✓</StyledCheck>
            {f}
          </StyledFeature>
        ))}
      </StyledFeatures>
    </StyledCard>
  );
};
