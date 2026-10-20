import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isGoogleCalendarEnabledState } from '@/client-config/states/isGoogleCalendarEnabledState';
import { isGoogleMessagingEnabledState } from '@/client-config/states/isGoogleMessagingEnabledState';
import { isMicrosoftCalendarEnabledState } from '@/client-config/states/isMicrosoftCalendarEnabledState';
import { isMicrosoftMessagingEnabledState } from '@/client-config/states/isMicrosoftMessagingEnabledState';
import {
  dismissConnectEmailNudge,
  isConnectEmailNudgeDismissed,
} from '@/desync-onboarding/utils/connectEmailNudgeDismissed';
import { useMyConnectedAccounts } from '@/settings/accounts/hooks/useMyConnectedAccounts';
import { useTriggerApisOAuth } from '@/settings/accounts/hooks/useTriggerApiOAuth';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { IconMail } from 'twenty-ui/icon';
import { Callout } from 'twenty-ui/primitives/feedback';
import {
  CalendarChannelVisibility,
  MessageChannelVisibility,
} from '~/generated/graphql';

const StyledNudgeContainer = styled.div`
  max-width: 100%;
  text-align: left;
  width: 480px;
`;

export type DesyncConnectEmailNudgePlacement =
  | 'get-started'
  | 'empty-companies'
  | 'empty-people';

type DesyncConnectEmailNudgeProps = {
  placement: DesyncConnectEmailNudgePlacement;
};

// Desync: most real records in a new workspace come from email + calendar
// sync, but many users skip the /sync/emails onboarding step and are left with
// demo data only. This card offers the same connection again, wherever an
// empty CRM is most visible, until the user connects an account or closes it.
// The data-ph-capture-attribute-* attributes tag PostHog autocapture clicks.
export const DesyncConnectEmailNudge = ({
  placement,
}: DesyncConnectEmailNudgeProps) => {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const { triggerApisOAuth } = useTriggerApisOAuth();
  const { accounts, loading } = useMyConnectedAccounts();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);

  const isGoogleMessagingEnabled = useAtomStateValue(
    isGoogleMessagingEnabledState,
  );
  const isGoogleCalendarEnabled = useAtomStateValue(
    isGoogleCalendarEnabledState,
  );
  const isMicrosoftMessagingEnabled = useAtomStateValue(
    isMicrosoftMessagingEnabledState,
  );
  const isMicrosoftCalendarEnabled = useAtomStateValue(
    isMicrosoftCalendarEnabledState,
  );

  const [isClosed, setIsClosed] = useState(false);

  const isDismissed =
    isClosed || isConnectEmailNudgeDismissed(currentWorkspace?.id);

  const isGoogleProviderEnabled =
    isGoogleMessagingEnabled || isGoogleCalendarEnabled;
  const isMicrosoftProviderEnabled =
    isMicrosoftMessagingEnabled || isMicrosoftCalendarEnabled;

  const provider = isGoogleProviderEnabled
    ? ConnectedAccountProvider.GOOGLE
    : isMicrosoftProviderEnabled
      ? ConnectedAccountProvider.MICROSOFT
      : undefined;

  if (isDismissed || loading || accounts.length > 0 || !provider) {
    return null;
  }

  const handleConnect = () =>
    triggerApisOAuth(provider, {
      redirectLocation: pathname,
      messageVisibility: MessageChannelVisibility.METADATA,
      calendarVisibility: CalendarChannelVisibility.METADATA,
      skipMessageChannelConfiguration: true,
    });

  const handleClose = () => {
    dismissConnectEmailNudge(currentWorkspace?.id);
    setIsClosed(true);
  };

  return (
    <StyledNudgeContainer
      data-ph-capture-attribute-desync-nudge="connect-email"
      data-ph-capture-attribute-desync-nudge-placement={placement}
    >
      <Callout
        variant="info"
        Icon={IconMail}
        title={
          provider === ConnectedAccountProvider.GOOGLE
            ? t`Connect Gmail to fill your CRM`
            : t`Connect Outlook to fill your CRM`
        }
        description={t`We add the people you email and meet with, and their companies, so your CRM fills itself in minutes. Personal addresses are skipped.`}
        action={{
          label:
            provider === ConnectedAccountProvider.GOOGLE
              ? t`Continue with Google`
              : t`Continue with Microsoft`,
          onClick: handleConnect,
        }}
        isClosable
        onClose={handleClose}
      />
    </StyledNudgeContainer>
  );
};
