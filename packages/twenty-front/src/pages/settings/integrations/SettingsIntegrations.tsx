import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconCheck, IconPlug, IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Section } from 'twenty-ui/primitives/layout';
import { Card, CardContent } from 'twenty-ui/primitives/surfaces';
import { H1Title, H1TitleFontColor, H2Title } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const INTEGRATIONS_BASE_URL = `${REACT_APP_SERVER_BASE_URL}/integrations`;

type IntegrationDef = {
  plugin: string;
  name: string;
  connectedBlurb: string;
  disconnectedBlurb: string;
  // Copilot-tool integrations (e.g. Slack via Composio) are used by the AI
  // assistant rather than synced, so they show no "Sync now" action.
  agentTool?: boolean;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    plugin: 'hubspot',
    name: 'HubSpot',
    connectedBlurb: 'Import contacts, companies & deals',
    disconnectedBlurb: 'Connect to import your CRM data',
  },
  {
    plugin: 'salesforce',
    name: 'Salesforce',
    connectedBlurb: 'Import accounts, contacts & opportunities',
    disconnectedBlurb: 'Connect to import your CRM data',
  },
  {
    plugin: 'desync',
    name: 'Desync Leads',
    connectedBlurb: 'Import your leads from the Desync platform',
    disconnectedBlurb: 'No Desync workspace found for your account',
  },
  {
    plugin: 'slack',
    name: 'Slack',
    connectedBlurb: 'Available to your AI assistant — post, search & read messages',
    disconnectedBlurb: 'Connect so the AI assistant can post & read Slack for you',
    agentTool: true,
  },
];

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledLeft = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledStatus = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

async function callIntegrations(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<any> {
  const res = await fetch(`${INTEGRATIONS_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json?.error ?? json?.message ?? `Request failed (${res.status})`);
  }
  return json;
}

const IntegrationCard = ({ integration }: { integration: IntegrationDef }) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { plugin, name } = integration;

  const [connected, setConnected] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await callIntegrations(`/${plugin}/status`, 'GET');
      setConnected(Boolean(res?.connected));
    } catch {
      setConnected(false);
    }
  }, [plugin]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const res = await callIntegrations(`/${plugin}/connect`, 'POST');
      if (res?.connectUrl) {
        window.location.href = res.connectUrl;
        return;
      }
      // Sources without OAuth (e.g. Desync) report their connection state inline.
      await refreshStatus();
      if (!res?.connected) {
        throw new Error(t`Nothing to import for your account yet`);
      }
      setIsConnecting(false);
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't start ${name} connection: ${String(
          (error as Error)?.message ?? error,
        )}`,
      });
      setIsConnecting(false);
    }
  }, [plugin, name, enqueueToast, t, refreshStatus]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setProgress(t`Starting…`);
    try {
      await callIntegrations(`/${plugin}/sync`, 'POST'); // kicks off a background job
      // Poll progress until the job reaches a terminal state (~up to 30 min).
      let final: any = null;
      for (let i = 0; i < 900 && !final; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        let st: any;
        try {
          st = await callIntegrations(`/${plugin}/sync/status`, 'GET');
        } catch {
          continue;
        }
        const c = st?.counts ?? {};
        setProgress(st?.phase ?? t`Imported ${c.created ?? 0} so far…`);
        if (st?.status === 'succeeded' || st?.status === 'failed') final = st;
      }
      const c = final?.counts ?? {};
      if (final?.status === 'succeeded') {
        enqueueToast({
          variant: 'success',
          children: t`${name} synced — ${c.created ?? 0} imported, ${c.skipped ?? 0} already up to date${(c.errors ?? 0) > 0 ? `, ${c.errors} skipped` : ''}.`,
        });
      } else if (final?.status === 'failed') {
        enqueueToast({
          variant: 'error',
          children: t`${name} sync failed: ${final?.error ?? 'unknown error'}`,
        });
      } else {
        enqueueToast({
          variant: 'success',
          children: t`${name} sync is still running in the background — check back shortly.`,
        });
      }
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`${name} sync failed: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setIsSyncing(false);
      setProgress(null);
    }
  }, [plugin, name, enqueueToast, t]);

  const statusLabel =
    connected === null ? t`Checking…` : connected ? t`Connected` : t`Not connected`;

  return (
    <Card rounded>
      <CardContent>
        <StyledRow>
          <StyledLeft>
            <IconPlug size={20} />
            <StyledText>
              <StyledName>{name}</StyledName>
              <StyledStatus>
                {isSyncing && progress
                  ? progress
                  : `${statusLabel} · ${
                      connected ? integration.connectedBlurb : integration.disconnectedBlurb
                    }`}
              </StyledStatus>
            </StyledText>
          </StyledLeft>
          <StyledActions>
            {connected ? (
              integration.agentTool ? null : (
                <Button
                  variant="solid"
                  color="accent"
                  startIcon={<IconRefresh size={16} />}
                  onClick={handleSync}
                  loading={isSyncing}
                >
                  {t`Sync now`}
                </Button>
              )
            ) : (
              <Button
                variant="solid"
                color="accent"
                startIcon={<IconCheck size={16} />}
                onClick={handleConnect}
                loading={isConnecting}
              >
                {t`Connect`}
              </Button>
            )}
          </StyledActions>
        </StyledRow>
      </CardContent>
    </Card>
  );
};

const StyledFooter = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[4]};
`;

const StyledModalBody = styled.div`
  margin-top: ${themeCssVariables.spacing[4]};
`;

const StyledModalActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[6]};

  /* Each action button takes an equal half so neither overflows the modal. */
  > * {
    flex: 1;
    min-width: 0;
  }
`;

const FEEDBACK_MODAL_ID = 'integrations-feedback-modal';

export const SettingsIntegrations = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal, closeModal } = useModal();

  const [feedbackKind, setFeedbackKind] = useState<'request' | 'problem'>('request');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const openFeedback = (kind: 'request' | 'problem') => {
    setFeedbackKind(kind);
    setMessage('');
    openModal(FEEDBACK_MODAL_ID);
  };

  const submitFeedback = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    try {
      await callIntegrations('/feedback', 'POST', { kind: feedbackKind, message: text });
      enqueueToast({ variant: 'success', children: t`Thanks — sent to the Desync team.` });
      setMessage('');
      closeModal(FEEDBACK_MODAL_ID);
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't send: ${String((error as Error)?.message ?? error)}`,
      });
    } finally {
      setSending(false);
    }
  };

  const isRequest = feedbackKind === 'request';

  return (
    <SettingsPageLayout
      links={[
        { children: t`Workspace`, href: getSettingsPath(SettingsPath.General) },
        { children: t`Integrations` },
      ]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Integrations`}
            description={t`Connect your other tools and bring their data into your CRM.`}
          />
          <StyledCards>
            {INTEGRATIONS.map((integration) => (
              <IntegrationCard key={integration.plugin} integration={integration} />
            ))}
          </StyledCards>
          <StyledFooter>
            <Button variant="outline" onClick={() => openFeedback('request')}>
              {t`Request an integration`}
            </Button>
            <Button variant="outline" onClick={() => openFeedback('problem')}>
              {t`Report a problem`}
            </Button>
          </StyledFooter>
        </Section>
      </SettingsPageContainer>

      <ModalStatefulWrapper
        modalInstanceId={FEEDBACK_MODAL_ID}
        onClose={() => closeModal(FEEDBACK_MODAL_ID)}
        isClosable
        size="medium"
        padding="large"
        overlay="dark"
        width="420px"
        dataGloballyPreventClickOutside
        renderInDocumentBody
        smallBorderRadius
        autoHeight
      >
        <H1Title
          title={isRequest ? t`Request an integration` : t`Report a problem`}
          fontColor={H1TitleFontColor.Primary}
        />
        <StyledModalBody>
          <SettingsTextInput
            instanceId={`${FEEDBACK_MODAL_ID}-message`}
            label={isRequest ? t`Which platform would you like?` : t`What happened?`}
            placeholder={
              isRequest ? t`e.g. Pipedrive, Zoho, Notion…` : t`Describe the problem…`
            }
            value={message}
            onChange={setMessage}
            maxLength={1000}
            autoFocusOnMount
            fullWidth
          />
        </StyledModalBody>
        <StyledModalActions>
          <Button variant="outline" onClick={() => closeModal(FEEDBACK_MODAL_ID)} fullWidth>
            {t`Cancel`}
          </Button>
          <Button
            variant="solid"
            color="accent"
            onClick={submitFeedback}
            disabled={!message.trim() || sending}
            fullWidth
          >
            {isRequest ? t`Send request` : t`Send`}
          </Button>
        </StyledModalActions>
      </ModalStatefulWrapper>
    </SettingsPageLayout>
  );
};
