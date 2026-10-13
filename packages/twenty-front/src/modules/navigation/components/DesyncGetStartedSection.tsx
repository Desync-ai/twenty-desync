import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { AppPath } from 'twenty-shared/types';
import { IconSparkles } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

// Desync: a prominent sidebar entry to the guided "Get started" page, so a new
// user always has an obvious next step (the dense app grid is confusing cold).
const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.betweenSiblingsGap};
  padding-bottom: ${themeCssVariables.spacing[2]};
`;

export const DesyncGetStartedSection = () => {
  const { t } = useLingui();

  return (
    <StyledSection role="group" aria-label="Get started">
      <NavigationDrawerItem
        label={t`Get started`}
        Icon={IconSparkles}
        to={AppPath.GetStarted}
      />
    </StyledSection>
  );
};
