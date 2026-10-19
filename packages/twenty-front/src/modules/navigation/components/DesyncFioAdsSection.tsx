import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { AppPath } from 'twenty-shared/types';
import { IconBroadcast } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

// Desync: sidebar entry that routes to the "Launch a Fio ad" page (AppPath.FioAds).
// Eligibility (workspace admin + paid) and the explainer live on the page itself.
const StyledSection = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.betweenSiblingsGap};
  padding-top: ${themeCssVariables.spacing[2]};
`;

export const DesyncFioAdsSection = () => {
  const { t } = useLingui();

  return (
    <StyledSection role="group" aria-label="Fio ads">
      <NavigationDrawerItem
        label={t`Launch a Fio ad`}
        Icon={IconBroadcast}
        to={AppPath.FioAds}
      />
    </StyledSection>
  );
};
