import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconPlug, IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { useToast } from 'twenty-ui/primitives/feedback';
import { Section } from 'twenty-ui/primitives/layout';
import { Card, CardContent } from 'twenty-ui/primitives/surfaces';
import {
  H1Title,
  H1TitleFontColor,
  H2Title,
} from 'twenty-ui/primitives/typography';
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
// 'key' = bring-your-own-key: the user pastes an API key we store directly and
// use on their behalf (e.g. Pocket, wired to its own MCP server, NOT Composio).
type IntegrationKind = 'connect' | 'mcp' | 'key';

export type IntegrationDef = {
  plugin: string;
  name: string;
  tags: string[];
  kind: IntegrationKind;
  logoDomain?: string;
  // Explicit logo image URL, tried before the clearbit/favicon domain fallback.
  logoUrl?: string;
  blurb: string;
  connectedBlurb?: string;
  // Copilot-tool connects (Slack, Airtable) are used by the AI assistant rather
  // than synced, so they show no "Sync now" action once connected.
  agentTool?: boolean;
  // For kind 'key': help text + input placeholder shown in the connect modal.
  keyHelp?: string;
  keyPlaceholder?: string;
};

export const INTEGRATIONS: IntegrationDef[] = [
  {
    plugin: 'hubspot',
    name: 'HubSpot',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'hubspot.com',
    agentTool: true,
    blurb:
      'Let the AI assistant read & manage your HubSpot contacts, companies & deals',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'salesforce',
    name: 'Salesforce',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'salesforce.com',
    agentTool: true,
    blurb:
      'Let the AI assistant read & manage your Salesforce accounts, contacts & opportunities',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'slack',
    name: 'Slack',
    kind: 'connect',
    tags: ['Messaging'],
    logoDomain: 'slack.com',
    agentTool: true,
    blurb: 'Let the AI assistant post, search & read Slack',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'airtable',
    name: 'Airtable',
    kind: 'connect',
    tags: ['Spreadsheets'],
    logoDomain: 'airtable.com',
    agentTool: true,
    blurb: 'Let the AI assistant read & write your bases',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'granola_mcp',
    name: 'Granola',
    kind: 'connect',
    tags: ['Meeting Notes'],
    logoDomain: 'granola.ai',
    agentTool: true,
    blurb: 'Let the AI assistant read your meeting notes & transcripts',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'pocket',
    name: 'Pocket',
    kind: 'key',
    tags: ['Meeting Notes'],
    logoDomain: 'heypocketai.com',
    logoUrl:
      'https://play-lh.googleusercontent.com/CqfEY5MnK7zPHmPLjzO7emJTsDEVpRld4Ri7XIDm6AjDwkGEK8ySTz9W7LSG-EdJwi9uTRzQKDuWtWatEylKjw=w240-h480-rw',
    agentTool: true,
    blurb:
      'Let the AI assistant search your Pocket recordings, transcripts & action items',
    connectedBlurb: 'Available to your AI assistant',
    keyHelp:
      'Paste your Pocket API key (starts with pk_). Find it in the Pocket app under Settings > Developer > API Keys.',
    keyPlaceholder: 'pk_...',
  },
  {
    plugin: 'fathom',
    name: 'Fathom',
    kind: 'key',
    tags: ['Meeting Notes'],
    logoDomain: 'fathom.video',
    agentTool: true,
    blurb:
      'Let the AI assistant search your Fathom meetings, transcripts & summaries',
    connectedBlurb: 'Available to your AI assistant',
    keyHelp:
      'Paste your Fathom API key. Find it in Fathom under Settings > API.',
    keyPlaceholder: 'Your Fathom API key',
  },
  {
    plugin: 'gmail',
    name: 'Gmail',
    kind: 'connect',
    tags: ['Email'],
    logoDomain: 'gmail.com',
    agentTool: true,
    blurb: 'Let the AI assistant read & answer questions about your email',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'outlook',
    name: 'Outlook',
    kind: 'connect',
    tags: ['Email', 'Calendar'],
    logoDomain: 'outlook.com',
    agentTool: true,
    blurb: 'Let the AI assistant read your email & calendar',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'googlecalendar',
    name: 'Google Calendar',
    kind: 'connect',
    tags: ['Calendar'],
    logoDomain: 'calendar.google.com',
    agentTool: true,
    blurb: 'Let the AI assistant check your schedule & book events',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'notion',
    name: 'Notion',
    kind: 'connect',
    tags: ['Docs & Files'],
    logoDomain: 'notion.so',
    agentTool: true,
    blurb: 'Let the AI assistant search & create your Notion pages',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'calendly',
    name: 'Calendly',
    kind: 'connect',
    tags: ['Calendar'],
    logoDomain: 'calendly.com',
    agentTool: true,
    blurb: 'Let the AI assistant see bookings & make scheduling links',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'microsoft_teams',
    name: 'Microsoft Teams',
    kind: 'connect',
    tags: ['Messaging'],
    logoDomain: 'teams.microsoft.com',
    agentTool: true,
    blurb: 'Let the AI assistant read channels & create meetings',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'googledrive',
    name: 'Google Drive',
    kind: 'connect',
    tags: ['Docs & Files'],
    logoDomain: 'drive.google.com',
    agentTool: true,
    blurb: 'Let the AI assistant find & read your Drive files',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'googlesheets',
    name: 'Google Sheets',
    kind: 'connect',
    tags: ['Spreadsheets'],
    logoDomain: 'sheets.google.com',
    agentTool: true,
    blurb: 'Let the AI assistant read & update your spreadsheets',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'instantly',
    name: 'Instantly',
    kind: 'connect',
    tags: ['Email'],
    logoDomain: 'instantly.ai',
    agentTool: true,
    blurb: 'Let the AI assistant run your cold-outreach campaigns & leads',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'attio',
    name: 'Attio',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'attio.com',
    agentTool: true,
    blurb: 'Let the AI assistant read and update your Attio CRM',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'twitter',
    name: 'X (Twitter)',
    kind: 'connect',
    tags: ['Messaging'],
    logoDomain: 'x.com',
    agentTool: true,
    blurb: 'Let the AI assistant post and engage on X for you',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'apollo',
    name: 'Apollo',
    kind: 'connect',
    tags: ['CRM'],
    logoDomain: 'apollo.io',
    agentTool: true,
    blurb: 'Let the AI assistant search, enrich, and manage leads in Apollo',
    connectedBlurb: 'Available to your AI assistant',
  },
  {
    plugin: 'claude',
    name: 'Claude',
    kind: 'mcp',
    tags: ['AI Agents'],
    logoDomain: 'anthropic.com',
    blurb: 'Give Claude secure access to your CRM over MCP',
  },
  {
    plugin: 'chatgpt',
    name: 'ChatGPT',
    kind: 'mcp',
    tags: ['AI Agents'],
    logoDomain: 'openai.com',
    blurb: 'Give ChatGPT secure access to your CRM over MCP',
  },
  {
    plugin: 'grok',
    name: 'Grok',
    kind: 'mcp',
    tags: ['AI Agents'],
    logoDomain: 'x.ai',
    blurb: 'Give Grok secure access to your CRM over MCP',
  },
  {
    plugin: 'cursor',
    name: 'Cursor',
    kind: 'mcp',
    tags: ['AI Agents'],
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
  url,
}: {
  domain?: string;
  name: string;
  url?: string;
}) => {
  // Try an explicit logo URL first (if given), then clearbit, then the google
  // favicon, then a plug icon. Any external block (CSP/404) falls through
  // gracefully so the card still renders.
  const sources = [
    url,
    domain ? `https://logo.clearbit.com/${domain}` : undefined,
    domain
      ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
      : undefined,
  ].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return <IconPlug size={22} />;
  }

  return (
    <StyledLogoImg
      src={sources[idx]}
      alt={name}
      onError={() => setIdx((i) => i + 1)}
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
    throw new Error(
      json?.error ?? json?.message ?? `Request failed (${res.status})`,
    );
  }
  return json;
}

// Bring-your-own-key integrations (Pocket) live at the server root (e.g.
// /pocket/status), NOT under /integrations, since they are not Composio-backed.
async function callDirect(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<any> {
  const res = await fetch(`${REACT_APP_SERVER_BASE_URL}${path}`, {
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
    throw new Error(
      json?.error ?? json?.message ?? `Request failed (${res.status})`,
    );
  }
  return json;
}

export const ConnectIntegrationCard = ({
  integration,
  compact = false,
}: {
  integration: IntegrationDef;
  // compact hides the description blurb (used on the Get-started page where
  // space is tight); the Settings grid keeps the blurbs.
  compact?: boolean;
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
      const res = await callIntegrations(`/${plugin}/connect`, 'POST', {
        returnPath: window.location.pathname,
      });
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
          children: t`${name} synced: ${c.created ?? 0} imported, ${c.skipped ?? 0} already up to date${(c.errors ?? 0) > 0 ? `, ${c.errors} skipped` : ''}.`,
        });
      } else if (final?.status === 'failed') {
        enqueueToast({
          variant: 'error',
          children: t`${name} sync failed: ${final?.error ?? 'unknown error'}`,
        });
      } else {
        enqueueToast({
          variant: 'success',
          children: t`${name} sync is still running in the background. Check back shortly.`,
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
              <IntegrationLogo
                domain={integration.logoDomain}
                name={name}
                url={integration.logoUrl}
              />
            </StyledLogoBox>
            <StyledName>{name}</StyledName>
          </StyledHeader>
          {!compact && (
            <StyledBlurb>
              {connected
                ? (integration.connectedBlurb ?? integration.blurb)
                : integration.blurb}
            </StyledBlurb>
          )}
          {isSyncing && progress ? (
            <StyledStatus>{progress}</StyledStatus>
          ) : null}
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
              <IntegrationLogo
                domain={integration.logoDomain}
                name={name}
                url={integration.logoUrl}
              />
            </StyledLogoBox>
            <StyledName>{name}</StyledName>
          </StyledHeader>
          <StyledBlurb>{integration.blurb}</StyledBlurb>
          {/* This integration runs inside the user's own AI app over MCP: they
              paste our endpoint + key INTO it, so it does not run in Desync.
              Because it lives entirely inside their agent, there is no
              connection state we can observe or show here, so we say so plainly
              rather than imply a status will appear. */}
          <StyledStatus>
            {t`This runs inside ${name}, not in Desync, so there is no connection status to show here. Add the connection details in ${name} and you are all set.`}
          </StyledStatus>
          <StyledCardActions>
            <Button
              variant="outline"
              // Button has no client-side `to`; href would full-reload the app.
              // oxlint-disable-next-line twenty/no-navigate-prefer-link
              onClick={() =>
                navigate(getSettingsPath(SettingsPath.ApiWebhooks))
              }
            >
              {t`Get connection details`}
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

// Bring-your-own-key card: the user pastes an API key in a modal; we store it
// directly and use it on their behalf (Pocket -> its own MCP server). Status /
// connect / disconnect hit /<plugin>/{status,connect,disconnect} at the root.
const KeyIntegrationCard = ({
  integration,
}: {
  integration: IntegrationDef;
}) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal, closeModal } = useModal();
  const { plugin, name } = integration;
  const modalId = `key-connect-${plugin}`;

  const [connected, setConnected] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await callDirect(`/${plugin}/status`, 'GET');
      setConnected(Boolean(res?.connected));
    } catch {
      setConnected(false);
    }
  }, [plugin]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const submitKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;
    setBusy(true);
    try {
      await callDirect(`/${plugin}/connect`, 'POST', { apiKey: key });
      enqueueToast({ variant: 'success', children: t`${name} connected.` });
      setApiKey('');
      closeModal(modalId);
      await refreshStatus();
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't connect ${name}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      });
    } finally {
      setBusy(false);
    }
  }, [
    apiKey,
    plugin,
    name,
    modalId,
    enqueueToast,
    t,
    closeModal,
    refreshStatus,
  ]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await callDirect(`/${plugin}/disconnect`, 'POST');
      await refreshStatus();
    } catch (error) {
      enqueueToast({
        variant: 'error',
        children: t`Couldn't disconnect ${name}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      });
    } finally {
      setBusy(false);
    }
  }, [plugin, name, enqueueToast, t, refreshStatus]);

  return (
    <StyledCard rounded>
      <StyledCardContent>
        <StyledCardInner>
          <StyledHeader>
            <StyledLogoBox>
              <IntegrationLogo
                domain={integration.logoDomain}
                name={name}
                url={integration.logoUrl}
              />
            </StyledLogoBox>
            <StyledName>{name}</StyledName>
          </StyledHeader>
          <StyledBlurb>
            {connected
              ? (integration.connectedBlurb ?? integration.blurb)
              : integration.blurb}
          </StyledBlurb>
          <StyledCardActions>
            {connected === null ? (
              <Button variant="outline" disabled>
                {t`Checking…`}
              </Button>
            ) : connected ? (
              <Button variant="outline" onClick={disconnect} loading={busy}>
                {t`Disconnect`}
              </Button>
            ) : (
              <Button
                variant="solid"
                color="accent"
                startIcon={<IconCheck size={16} />}
                onClick={() => {
                  setApiKey('');
                  openModal(modalId);
                }}
              >
                {t`Connect`}
              </Button>
            )}
          </StyledCardActions>
        </StyledCardInner>
      </StyledCardContent>

      <ModalStatefulWrapper
        modalInstanceId={modalId}
        onClose={() => closeModal(modalId)}
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
          title={t`Connect ${name}`}
          fontColor={H1TitleFontColor.Primary}
        />
        <StyledModalBody>
          {integration.keyHelp ? (
            <StyledStatus>{integration.keyHelp}</StyledStatus>
          ) : null}
          <SettingsTextInput
            instanceId={`${modalId}-key`}
            label={t`API key`}
            placeholder={integration.keyPlaceholder ?? t`Paste your API key`}
            value={apiKey}
            onChange={setApiKey}
            autoFocusOnMount
            fullWidth
          />
        </StyledModalBody>
        <StyledModalActions>
          <Button
            variant="outline"
            onClick={() => closeModal(modalId)}
            fullWidth
          >
            {t`Cancel`}
          </Button>
          <Button
            variant="solid"
            color="accent"
            onClick={submitKey}
            disabled={!apiKey.trim() || busy}
            fullWidth
          >
            {t`Connect`}
          </Button>
        </StyledModalActions>
      </ModalStatefulWrapper>
    </StyledCard>
  );
};

const FEEDBACK_MODAL_ID = 'integrations-feedback-modal';
const ALL_TAG = 'All';

export const SettingsIntegrations = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openModal, closeModal } = useModal();

  const [activeTag, setActiveTag] = useState<string>(ALL_TAG);
  const [feedbackKind, setFeedbackKind] = useState<'request' | 'problem'>(
    'request',
  );
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
      await callIntegrations('/feedback', 'POST', {
        kind: feedbackKind,
        message: text,
      });
      enqueueToast({
        variant: 'success',
        children: t`Thanks, sent to the Desync team.`,
      });
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
                <McpIntegrationCard
                  key={integration.plugin}
                  integration={integration}
                />
              ) : integration.kind === 'key' ? (
                <KeyIntegrationCard
                  key={integration.plugin}
                  integration={integration}
                />
              ) : (
                <ConnectIntegrationCard
                  key={integration.plugin}
                  integration={integration}
                />
              ),
            )}
          </StyledGrid>
          <StyledFooter>
            <Button variant="outline" onClick={() => openFeedback('request')}>
              {t`Request an integration`}
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
            label={
              isRequest ? t`Which platform would you like?` : t`What happened?`
            }
            placeholder={
              isRequest
                ? t`e.g. Pipedrive, Zoho, Notion…`
                : t`Describe the problem…`
            }
            value={message}
            onChange={setMessage}
            maxLength={1000}
            autoFocusOnMount
            fullWidth
          />
        </StyledModalBody>
        <StyledModalActions>
          <Button
            variant="outline"
            onClick={() => closeModal(FEEDBACK_MODAL_ID)}
            fullWidth
          >
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
