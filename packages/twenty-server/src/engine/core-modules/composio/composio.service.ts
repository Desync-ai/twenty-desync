import { Injectable, Logger } from '@nestjs/common';

// Thin server-to-server client for Composio's REST API (https://docs.composio.dev).
// We deliberately use REST via `fetch` rather than the `@composio/*` SDKs: those
// packages are ESM-only and twenty-server compiles to CommonJS (swc), so the SDK
// cannot be imported here. REST needs only the platform API key in `x-api-key`.
//
// Multi-toolkit: each connectable app (Slack, Airtable, …) is one entry in the
// registry below, enabled when its managed-OAuth auth-config id is present.
//
// Config (env on the server/worker — fork convention, NOT config-variables.ts):
//   COMPOSIO_API_KEY                   platform API key (ak_...), used as x-api-key
//   COMPOSIO_SLACK_AUTH_CONFIG_ID      managed-OAuth auth config for Slack (ac_...)
//   COMPOSIO_AIRTABLE_AUTH_CONFIG_ID   managed-OAuth auth config for Airtable (ac_...)
//   FRONTEND_URL / SERVER_URL          used to build the post-OAuth return URL
const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export type ComposioTool = { slug: string; description: string };

export type ComposioToolkit = {
  slug: string; // Composio toolkit slug (= connected_accounts toolkit.slug)
  label: string;
  authConfigId: string; // managed-OAuth auth config (ac_...)
  tools: ComposioTool[];
};

// Curated Slack tools exposed to the copilot (slug -> short description). Kept
// intentionally small out of each toolkit's full set; schemas are fetched lazily.
export const COMPOSIO_SLACK_TOOLS: ComposioTool[] = [
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

// Curated Airtable tools exposed to the copilot.
export const COMPOSIO_AIRTABLE_TOOLS: ComposioTool[] = [
  {
    slug: 'AIRTABLE_LIST_BASES',
    description: 'List the Airtable bases the connected account can access.',
  },
  {
    slug: 'AIRTABLE_GET_BASE_SCHEMA',
    description:
      'Get the tables and fields (schema) of an Airtable base. Requires the base id.',
  },
  {
    slug: 'AIRTABLE_LIST_RECORDS',
    description:
      'List/query records from an Airtable table. Requires base id and table id/name.',
  },
  {
    slug: 'AIRTABLE_GET_RECORD',
    description: 'Get a single Airtable record by id (base id, table, record id).',
  },
  {
    slug: 'AIRTABLE_CREATE_RECORD',
    description: 'Create a record in an Airtable table (base id, table, fields).',
  },
  {
    slug: 'AIRTABLE_CREATE_MULTIPLE_RECORDS',
    description: 'Create several records at once in an Airtable table.',
  },
  {
    slug: 'AIRTABLE_UPDATE_RECORD',
    description: 'Update fields on an existing Airtable record.',
  },
  {
    slug: 'AIRTABLE_DELETE_RECORD',
    description: 'Delete an Airtable record by id.',
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
  private readonly frontendBase = (
    process.env.FRONTEND_URL ??
    process.env.SERVER_URL ??
    ''
  ).replace(/\/+$/, '');

  // Toolkit registry — a toolkit is enabled only when its auth-config id is set
  // (so e.g. Airtable can be live on dev but absent on prod just via env).
  private readonly toolkits: Record<string, ComposioToolkit> =
    this.buildToolkits();

  private buildToolkits(): Record<string, ComposioToolkit> {
    const defs: ComposioToolkit[] = [
      {
        slug: 'slack',
        label: 'Slack',
        authConfigId:
          process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID ?? 'ac_Ah0NHIAcp6XC',
        tools: COMPOSIO_SLACK_TOOLS,
      },
      {
        slug: 'airtable',
        label: 'Airtable',
        authConfigId: process.env.COMPOSIO_AIRTABLE_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_AIRTABLE_TOOLS,
      },
    ];
    const map: Record<string, ComposioToolkit> = {};

    for (const def of defs) {
      if (def.authConfigId) {
        map[def.slug] = def;
      }
    }

    return map;
  }

  // Lazily-fetched, process-lifetime cache of tool JSON schemas.
  private schemaCache: Record<string, object> | null = null;
  // Short-lived per-user cache of the connected toolkit slugs, so the copilot
  // doesn't hit Composio on every single chat turn.
  private readonly statusCache = new Map<
    string,
    { slugs: Set<string>; at: number }
  >();
  private static readonly STATUS_TTL_MS = 30_000;

  get isConfigured(): boolean {
    return Boolean(this.apiKey) && Object.keys(this.toolkits).length > 0;
  }

  isToolkitEnabled(toolkitSlug: string): boolean {
    return Boolean(this.apiKey) && toolkitSlug in this.toolkits;
  }

  get enabledToolkits(): ComposioToolkit[] {
    return Object.values(this.toolkits);
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

  // Hosted Composio connect URL the user visits to OAuth their own account for
  // the given toolkit (keyed by the Twenty user id).
  async getConnectUrl(
    toolkitSlug: string,
    userId: string,
  ): Promise<ComposioConnectResult> {
    const toolkit = this.toolkits[toolkitSlug];

    if (!this.apiKey || !toolkit) {
      throw new Error(`Composio toolkit not configured: ${toolkitSlug}`);
    }
    const res = await this.request<{
      redirectUrl?: string;
      redirect_url?: string;
    }>('POST', '/connected_accounts/link', {
      auth_config_id: toolkit.authConfigId,
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

  // Which of our ENABLED toolkits the user has an ACTIVE connection for (one
  // API call, cached). Fail-soft: errors return an empty set, never throw.
  async getConnectedToolkits(userId: string): Promise<Set<string>> {
    if (!this.apiKey || !userId) {
      return new Set();
    }
    const cached = this.statusCache.get(userId);

    if (cached && Date.now() - cached.at < ComposioService.STATUS_TTL_MS) {
      return cached.slugs;
    }

    let slugs = new Set<string>();

    try {
      const res = await this.request<{ items?: ConnectedAccount[] }>(
        'GET',
        `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
      );
      const enabled = new Set(Object.keys(this.toolkits));

      slugs = new Set(
        (res.items ?? [])
          .filter(
            (account) =>
              account.status === 'ACTIVE' &&
              account.toolkit?.slug !== undefined &&
              enabled.has(account.toolkit.slug),
          )
          .map((account) => account.toolkit!.slug as string),
      );
    } catch (error) {
      this.logger.warn(
        `Composio status check failed: ${(error as Error).message}`,
      );
      slugs = new Set();
    }
    this.statusCache.set(userId, { slugs, at: Date.now() });

    return slugs;
  }

  async isConnected(toolkitSlug: string, userId: string): Promise<boolean> {
    return (await this.getConnectedToolkits(userId)).has(toolkitSlug);
  }

  async disconnect(toolkitSlug: string, userId: string): Promise<void> {
    if (!this.apiKey || !userId) {
      return;
    }

    try {
      const res = await this.request<{ items?: ConnectedAccount[] }>(
        'GET',
        `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
      );

      await Promise.all(
        (res.items ?? [])
          .filter((account) => account.toolkit?.slug === toolkitSlug)
          .map((account) =>
            this.request('DELETE', `/connected_accounts/${account.id}`),
          ),
      );
    } catch (error) {
      this.logger.warn(
        `Composio disconnect failed: ${(error as Error).message}`,
      );
    } finally {
      this.statusCache.delete(userId);
    }
  }

  // Curated tool descriptors for the user's CONNECTED toolkits only.
  async getToolsForUser(userId: string): Promise<ComposioTool[]> {
    const connected = await this.getConnectedToolkits(userId);
    const out: ComposioTool[] = [];

    for (const slug of connected) {
      const toolkit = this.toolkits[slug];

      if (toolkit) {
        out.push(...toolkit.tools);
      }
    }

    return out;
  }

  // JSON schema for every curated tool across enabled toolkits, fetched once.
  async getToolSchemas(): Promise<Record<string, object>> {
    if (this.schemaCache) {
      return this.schemaCache;
    }
    const slugs = this.enabledToolkits.flatMap((toolkit) =>
      toolkit.tools.map((tool) => tool.slug),
    );
    const map: Record<string, object> = {};

    if (slugs.length === 0) {
      return map;
    }

    try {
      const res = await this.request<{
        items?: { slug: string; input_parameters?: object }[];
      }>('GET', `/tools?tool_slugs=${encodeURIComponent(slugs.join(','))}&limit=200`);

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

  // Execute any Composio tool by slug, scoped to the user (Composio routes by
  // slug to the user's connected account for that toolkit).
  async execute(
    userId: string,
    toolSlug: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    if (!this.apiKey) {
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
