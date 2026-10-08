import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

// 'connect' = OAuth/sync via the integrations API. 'mcp' = an AI agent that
// connects to the CRM through our built-in MCP server; the card just deep-links
// to Settings -> API & MCP where the user makes a key + copies the endpoint.
type IntegrationKind = 'connect' | 'mcp';

type IntegrationDef = {
  plugin: string;
  name: string;
  tags: string[];
  kind: IntegrationKind;
  logoDomain?: string;
  blurb: string;
  connectedBlurb?: string;
  // Copilot-tool connects (Slack, Airtable) are used by the AI assistant rather
  // than synced, so they show no "Sync now" action once connected.
  agentTool?: boolean;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    plugin: 'hubspot',
    name: 'HubSpot',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'hubspot.com',
    blurb: 'Import contacts, companies & deals',
    connectedBlurb: 'Contacts, companies & deals',
  },
  {
    plugin: 'salesforce',
    name: 'Salesforce',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'salesforce.com',
    blurb: 'Import accounts, contacts & opportunities',
    connectedBlurb: 'Accounts, contacts & opportunities',
  },
  {
    plugin: 'desync',
    name: 'Desync Leads',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'desync.ai',
    blurb: 'Import your leads from the Desync platform',
    connectedBlurb: 'Your Desync leads',
  },
  {
    plugin: 'slack',
    name: 'Slack',
    kind: 'connect',
    tags: ['Productivity'],
    logoDomain: 'slack.com',
    agentTool: true,
    blurb: 'Let the AI assistant post, search & read Slack',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'airtable',
    name: 'Airtable',
    kind: 'connect',
    tags: ['Productivity'],
    logoDomain: 'airtable.com',
    agentTool: true,
    blurb: 'Let the AI assistant read & write your bases',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'claude',
    name: 'Claude',
    kind: 'mcp',
    tags: ['AI'],
    logoDomain: 'anthropic.com',
    blurb: 'Give Claude secure access to your CRM over MCP',
  },
  {
    plugin: 'chatgpt',
    name: 'ChatGPT',
    kind: 'mcp',
    tags: ['AI'],
    logoDomain: 'openai.com',
    blurb: 'Give ChatGPT secure access to your CRM over MCP',
  },
  {
    plugin: 'grok',
    name: 'Grok',
    kind: 'mcp',
    tags: ['AI'],
    logoDomain: 'x.ai',
    blurb: 'Give Grok secure access to your CRM over MCP',
  },
  {
    plugin: 'cursor',
    name: 'Cursor',
    kind: 'mcp',
    tags: ['AI'],
    logoDomain: 'cursor.com',
    blurb: 'Give Cursor secure access to your CRM over MCP',
  },
];

const StyledFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
`;

// Stretch the whole Card -> CardContent -> inner chain to the grid row height so
// every card is equally tall and the action row can bottom-anchor uniformly.
const StyledCard = styled(Card)`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledCardContent = styled(CardContent)`
  display: flex;
  flex: 1;
  flex-direction: column;
`;

const StyledCardInner = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  height: 100%;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledLogoBox = styled.div`
  align-items: center;
  display: flex;
  height: 28px;
  justify-content: center;
  width: 28px;
`;

const StyledLogoImg = styled.img`
  border-radius: 6px;
  height: 28px;
  object-fit: contain;
  width: 28px;
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledBlurb = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledStatus = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledCardActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-start;
  margin-top: ${themeCssVariables.spacing[1]};
`;

const IntegrationLogo = ({
  domain,
  name,
}: {
  domain?: string;
  name: string;
}) => {
  // clearbit logo -> google favicon -> plug icon. Any external block (CSP/404)
  // falls through gracefully so the card still renders.
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  if (!domain || stage === 2) {
    return <IconPlug size={22} />;
  }
  const src =
    stage === 0
      ? `https://logo.clearbit.com/${domain}`
      : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return (
    <StyledLogoImg
      src={src}
      alt={name}
      onError={() => setStage((s) => (s + 1) as 0 | 1 | 2)}
    />
  );
};

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

const ConnectIntegrationCard = ({
  integration,
}: {
  integration: IntegrationDef;
}) => {
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
      await callIntegrations(`/${plugin}/sync`, 'POST');
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

  return (
    <StyledCard rounded>
      <StyledCardContent>
        <StyledCardInner>
          <StyledHeader>
            <StyledLogoBox>
              <IntegrationLogo domain={integration.logoDomain} name={name} />
            </StyledLogoBox>
            <StyledName>{name}</StyledName>
          </StyledHeader>
          <StyledBlurb>
            {connected ? integration.connectedBlurb ?? integration.blurb : integration.blurb}
          </StyledBlurb>
          {isSyncing && progress ? <StyledStatus>{progress}</StyledStatus> : null}
          <StyledCardActions>
            {connected === null ? (
              <Button variant="outline" disabled>
                {t`Checking…`}
              </Button>
            ) : connected ? (
              integration.agentTool ? (
                <Button
                  variant="outline"
                  disabled
                  startIcon={<IconCheck size={16} />}
                >
                  {t`Connected`}
                </Button>
              ) : (
                <Button
                  variant="solid"
                  color="accent"
                  startIcon={<IconRefresh size={16} />}
                  onClick={handleSync}
                  loading={isSyncing}
                >
                  {t`Sync`}
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
          </StyledCardActions>
        </StyledCardInner>
      </StyledCardContent>
    </StyledCard>
  );
};

const McpIntegrationCard = ({
  integration,
}: {
  integration: IntegrationDef;
}) => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { name } = integration;

  return (
    <StyledCard rounded>
      <StyledCardContent>
        <StyledCardInner>
          <StyledHeader>
            <StyledLogoBox>
              <IntegrationLogo domain={integration.logoDomain} name={name} />
            </StyledLogoBox>
            <StyledName>{name}</StyledName>
          </StyledHeader>
          <StyledBlurb>{integration.blurb}</StyledBlurb>
          <StyledStatus>{t`Connects via MCP`}</StyledStatus>
          <StyledCardActions>
            <Button
              variant="outline"
              onClick={() => navigate(getSettingsPath(SettingsPath.ApiWebhooks))}
            >
              {t`Set up`}
            </Button>
          </StyledCardActions>
        </StyledCardInner>
      </StyledCardContent>
    </StyledCard>
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

  > * {
    flex: 1;
    min-width: 0;
  }
`;

const FEEDBACK_MODAL_ID = 'integrations-feedback-modal';
const ALL_TAG = 'All';

export const SettingsIntegrations = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal, closeModal } = useModal();

  const [activeTag, setActiveTag] = useState<string>(ALL_TAG);
  const [feedbackKind, setFeedbackKind] = useState<'request' | 'problem'>('request');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const integration of INTEGRATIONS) {
      for (const tag of integration.tags) set.add(tag);
    }
    return [ALL_TAG, ...[...set].sort()];
  }, []);

  const visible = useMemo(
    () =>
      activeTag === ALL_TAG
        ? INTEGRATIONS
        : INTEGRATIONS.filter((integration) =>
            integration.tags.includes(activeTag),
          ),
    [activeTag],
  );

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
            description={t`Connect your tools and AI agents to your CRM.`}
          />
          <StyledFilters>
            {tags.map((tag) => (
              <Button
                key={tag}
                variant={activeTag === tag ? 'solid' : 'outline'}
                color={activeTag === tag ? 'accent' : undefined}
                onClick={() => setActiveTag(tag)}
              >
                {tag}
              </Button>
            ))}
          </StyledFilters>
          <StyledGrid>
            {visible.map((integration) =>
              integration.kind === 'mcp' ? (
                <McpIntegrationCard key={integration.plugin} integration={integration} />
              ) : (
                <ConnectIntegrationCard key={integration.plugin} integration={integration} />
              ),
            )}
          </StyledGrid>
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
