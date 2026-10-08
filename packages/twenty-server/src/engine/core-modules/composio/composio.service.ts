import { Injectable, Logger } from '@nestjs/common';

// Thin server-to-server client for Composio's REST API (https://docs.composio.dev).
// We deliberately use REST via `fetch` rather than the `@composio/*` SDKs: those
// packages are ESM-only and twenty-server compiles to CommonJS (swc), so the SDK
// cannot be imported here. REST needs only the platform API key in `x-api-key`.
//
// Config (env on the server/worker — fork convention, NOT config-variables.ts):
//   COMPOSIO_API_KEY                platform API key (ak_...), used as x-api-key
//   COMPOSIO_SLACK_AUTH_CONFIG_ID   managed-OAuth auth config for Slack (ac_...)
//   FRONTEND_URL / SERVER_URL       used to build the post-OAuth return URL
const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

// Curated Slack tools exposed to the copilot (slug -> short description). Kept
// intentionally small out of Slack's 130+ tools; JSON schemas are fetched lazily.
export const COMPOSIO_SLACK_TOOLS: { slug: string; description: string }[] = [
  {
    slug: 'SLACK_CHAT_POST_MESSAGE',
    description:
      'Post a message to a Slack channel, DM, or private group. Requires `channel` (id or name) and message `text`.',
  },
  {
    slug: 'SLACK_LIST_ALL_CHANNELS',
    description: 'List channels/conversations in the connected Slack workspace.',
  },
  {
    slug: 'SLACK_FETCH_CONVERSATION_HISTORY',
    description: 'Fetch recent messages from a Slack channel. Requires `channel`.',
  },
  {
    slug: 'SLACK_SEARCH_MESSAGES',
    description: 'Search messages across the Slack workspace. Requires a `query`.',
  },
  {
    slug: 'SLACK_FIND_USERS',
    description:
      'Find Slack users by name, email, or display name. Requires `search_query`.',
  },
  {
    slug: 'SLACK_FIND_CHANNELS',
    description:
      'Find Slack channels by name, topic, or purpose. Requires `search_query`.',
  },
  {
    slug: 'SLACK_ADD_REACTION_TO_AN_ITEM',
    description:
      'Add an emoji reaction to a message. Requires `channel`, `name` (emoji), and `timestamp`.',
  },
];

type ConnectedAccount = {
  id: string;
  status: string;
  toolkit?: { slug?: string };
};

export type ComposioConnectResult = {
  connectUrl: string | null;
  connected?: boolean;
  expiresAt: string | null;
};

@Injectable()
export class ComposioService {
  private readonly logger = new Logger(ComposioService.name);
  private readonly apiKey = process.env.COMPOSIO_API_KEY ?? '';
  private readonly slackAuthConfigId =
    process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID ?? 'ac_Ah0NHIAcp6XC';
  private readonly frontendBase = (
    process.env.FRONTEND_URL ??
    process.env.SERVER_URL ??
    ''
  ).replace(/\/+$/, '');

  // Lazily-fetched, process-lifetime cache of tool JSON schemas.
  private schemaCache: Record<string, object> | null = null;
  // Short-lived per-user connection-status cache so the copilot doesn't hit
  // Composio on every single chat turn.
  private readonly statusCache = new Map<
    string,
    { connected: boolean; at: number }
  >();
  private static readonly STATUS_TTL_MS = 30_000;

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private get callbackUrl(): string | undefined {
    return this.frontendBase
      ? `${this.frontendBase}/settings/integrations`
      : undefined;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${COMPOSIO_BASE_URL}${path}`, {
      method,
      headers: {
        'x-api-key': this.apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: unknown = {};

    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error(
        `Composio ${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`,
      );
    }

    return json as T;
  }

  // Hosted Composio connect URL the user visits to OAuth their own Slack.
  async getSlackConnectUrl(userId: string): Promise<ComposioConnectResult> {
    if (!this.isConfigured) {
      throw new Error('Composio is not configured (COMPOSIO_API_KEY)');
    }
    const res = await this.request<{
      redirectUrl?: string;
      redirect_url?: string;
    }>('POST', '/connected_accounts/link', {
      auth_config_id: this.slackAuthConfigId,
      user_id: userId,
      ...(this.callbackUrl ? { callback_url: this.callbackUrl } : {}),
    });

    // A fresh link may change connection state — invalidate the status cache.
    this.statusCache.delete(userId);

    return {
      connectUrl: res.redirectUrl ?? res.redirect_url ?? null,
      expiresAt: null,
    };
  }

  async isSlackConnected(userId: string): Promise<boolean> {
    if (!this.isConfigured || !userId) {
      return false;
    }
    const cached = this.statusCache.get(userId);

    if (cached && Date.now() - cached.at < ComposioService.STATUS_TTL_MS) {
      return cached.connected;
    }

    let connected = false;

    try {
      const res = await this.request<{ items?: ConnectedAccount[] }>(
        'GET',
        `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
      );

      connected = (res.items ?? []).some(
        (account) =>
          account.toolkit?.slug === 'slack' && account.status === 'ACTIVE',
      );
    } catch (error) {
      // Fail soft: never block the copilot or the settings UI on a status call.
      this.logger.warn(
        `Composio Slack status check failed: ${(error as Error).message}`,
      );
      connected = false;
    }
    this.statusCache.set(userId, { connected, at: Date.now() });

    return connected;
  }

  async disconnectSlack(userId: string): Promise<void> {
    if (!this.isConfigured || !userId) {
      return;
    }

    try {
      const res = await this.request<{ items?: ConnectedAccount[] }>(
        'GET',
        `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
      );

      await Promise.all(
        (res.items ?? [])
          .filter((account) => account.toolkit?.slug === 'slack')
          .map((account) =>
            this.request('DELETE', `/connected_accounts/${account.id}`),
          ),
      );
    } catch (error) {
      this.logger.warn(
        `Composio Slack disconnect failed: ${(error as Error).message}`,
      );
    } finally {
      this.statusCache.delete(userId);
    }
  }

  // JSON schema per curated tool, fetched once and cached for the process.
  async getToolSchemas(): Promise<Record<string, object>> {
    if (this.schemaCache) {
      return this.schemaCache;
    }
    const slugs = COMPOSIO_SLACK_TOOLS.map((tool) => tool.slug).join(',');
    const map: Record<string, object> = {};

    try {
      const res = await this.request<{
        items?: { slug: string; input_parameters?: object }[];
      }>('GET', `/tools?tool_slugs=${encodeURIComponent(slugs)}&limit=100`);

      for (const item of res.items ?? []) {
        if (item.slug && item.input_parameters) {
          map[item.slug] = item.input_parameters;
        }
      }
      this.schemaCache = map;
    } catch (error) {
      // Don't cache a failure — retry on the next request.
      this.logger.warn(
        `Composio tool-schema fetch failed: ${(error as Error).message}`,
      );

      return map;
    }

    return this.schemaCache;
  }

  async executeSlackTool(
    userId: string,
    toolSlug: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    if (!this.isConfigured) {
      return { ok: false, error: 'Composio is not configured' };
    }

    try {
      const res = await this.request<{
        data?: unknown;
        error?: unknown;
        successful?: boolean;
      }>('POST', `/tools/execute/${encodeURIComponent(toolSlug)}`, {
        user_id: userId,
        arguments: args ?? {},
      });

      if (res.error) {
        return {
          ok: false,
          error:
            typeof res.error === 'string'
              ? res.error
              : JSON.stringify(res.error),
        };
      }

      return { ok: true, data: res.data ?? res };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
