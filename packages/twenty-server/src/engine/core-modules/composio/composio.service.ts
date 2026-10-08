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
//   COMPOSIO_SLACK_AUTH_CONFIG_ID         managed-OAuth auth config for Slack (ac_...)
//   COMPOSIO_AIRTABLE_AUTH_CONFIG_ID      managed-OAuth auth config for Airtable (ac_...)
//   COMPOSIO_GRANOLA_MCP_AUTH_CONFIG_ID   DCR-OAuth auth config for Granola (ac_...)
//   COMPOSIO_GRANOLA_MCP_SERVER_URL       Composio MCP server URL for Granola (.../mcp)
//   FRONTEND_URL / SERVER_URL             used to build the post-OAuth return URL
//
// Most toolkits are plain REST tools (POST /tools/execute/<slug>). "MCP" toolkits
// (e.g. Granola) instead proxy an upstream MCP server: their tools are NOT in
// Composio's REST tool catalog, so they are discovered and executed over MCP
// JSON-RPC at the toolkit's `mcpServerUrl` (see mcpRequest). Connect/status are
// identical to REST toolkits (a Composio connected account keyed by user id).
const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export type ComposioTool = { slug: string; description: string };

export type ComposioToolkit = {
  slug: string; // Composio toolkit slug (= connected_accounts toolkit.slug)
  label: string;
  authConfigId: string; // managed-OAuth auth config (ac_...)
  tools: ComposioTool[]; // curated REST tools; empty for MCP toolkits (discovered)
  // When set, this toolkit is an MCP proxy: its tools are listed/executed over
  // MCP JSON-RPC at this URL instead of Composio's REST /tools/execute path.
  mcpServerUrl?: string;
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
      {
        // Granola is an MCP toolkit: tools come from its MCP server, not REST.
        slug: 'granola_mcp',
        label: 'Granola',
        authConfigId: process.env.COMPOSIO_GRANOLA_MCP_AUTH_CONFIG_ID ?? '',
        tools: [],
        mcpServerUrl: process.env.COMPOSIO_GRANOLA_MCP_SERVER_URL ?? '',
      },
    ];
    const map: Record<string, ComposioToolkit> = {};

    for (const def of defs) {
      // Every toolkit needs an auth config to connect; an MCP toolkit also needs
      // its server URL to list/run tools — without it, leave the toolkit off.
      const isMcp = def.mcpServerUrl !== undefined;
      const enabled = Boolean(def.authConfigId) && (!isMcp || Boolean(def.mcpServerUrl));

      if (enabled) {
        map[def.slug] = def;
      }
    }

    return map;
  }

  // Lazily-fetched, process-lifetime cache of tool JSON schemas.
  private schemaCache: Record<string, object> | null = null;
  // Process-lifetime cache of each MCP toolkit's tools (static), keyed by toolkit
  // slug — so the MCP tools/list runs once per process, not per chat turn.
  private readonly mcpToolsCache = new Map<
    string,
    { tools: ComposioTool[]; schemas: Record<string, object> }
  >();
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

  // Curated tool descriptors for the user's CONNECTED toolkits only. MCP toolkits
  // contribute the tools their MCP server advertises (cached, static schemas).
  async getToolsForUser(userId: string): Promise<ComposioTool[]> {
    const connected = await this.getConnectedToolkits(userId);
    const out: ComposioTool[] = [];

    for (const slug of connected) {
      const toolkit = this.toolkits[slug];

      if (!toolkit) {
        continue;
      }

      if (toolkit.mcpServerUrl) {
        try {
          const { tools } = await this.getMcpToolkitTools(toolkit, userId);

          out.push(...tools);
        } catch (error) {
          this.logger.warn(
            `Composio MCP tools/list failed for ${slug}: ${(error as Error).message}`,
          );
        }
      } else {
        out.push(...toolkit.tools);
      }
    }

    return out;
  }

  // JSON schema for every tool across enabled toolkits, fetched once. REST
  // toolkits resolve via a bulk /tools query; MCP toolkits via their tools/list.
  async getToolSchemas(): Promise<Record<string, object>> {
    if (this.schemaCache) {
      return this.schemaCache;
    }
    const map: Record<string, object> = {};
    let ok = true;

    const restSlugs = this.enabledToolkits
      .filter((toolkit) => !toolkit.mcpServerUrl)
      .flatMap((toolkit) => toolkit.tools.map((tool) => tool.slug));

    if (restSlugs.length > 0) {
      try {
        const res = await this.request<{
          items?: { slug: string; input_parameters?: object }[];
        }>(
          'GET',
          `/tools?tool_slugs=${encodeURIComponent(restSlugs.join(','))}&limit=200`,
        );

        for (const item of res.items ?? []) {
          if (item.slug && item.input_parameters) {
            map[item.slug] = item.input_parameters;
          }
        }
      } catch (error) {
        ok = false;
        this.logger.warn(
          `Composio tool-schema fetch failed: ${(error as Error).message}`,
        );
      }
    }

    for (const toolkit of this.enabledToolkits) {
      if (!toolkit.mcpServerUrl) {
        continue;
      }

      try {
        const { schemas } = await this.getMcpToolkitTools(toolkit, 'schema');

        Object.assign(map, schemas);
      } catch (error) {
        ok = false;
        this.logger.warn(
          `Composio MCP schema fetch failed for ${toolkit.slug}: ${(error as Error).message}`,
        );
      }
    }

    // Only cache a fully-successful fetch, so a transient failure is retried.
    if (ok) {
      this.schemaCache = map;
    }

    return map;
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

    // MCP toolkits (e.g. Granola) aren't in the REST execute path — route their
    // slugs to the MCP server instead.
    const mcpToolkit = this.mcpToolkitForSlug(toolSlug);

    if (mcpToolkit) {
      return this.executeMcp(mcpToolkit, userId, toolSlug, args);
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

  // ---- MCP-toolkit support (e.g. Granola) -----------------------------------
  // Some Composio toolkits proxy an upstream MCP server and are absent from the
  // REST tool catalog. Their tools are listed/called over MCP JSON-RPC at the
  // toolkit's `mcpServerUrl`. Composio's MCP server is stateless (no initialize
  // or session needed) and answers as SSE, so one POST per call is enough.

  private mcpToolkitForSlug(toolSlug: string): ComposioToolkit | undefined {
    return this.enabledToolkits.find(
      (toolkit) =>
        Boolean(toolkit.mcpServerUrl) &&
        toolSlug.startsWith(`${toolkit.slug.toUpperCase()}_`),
    );
  }

  private async mcpRequest(
    serverUrl: string,
    userId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<{ result?: any; error?: any }> {
    const sep = serverUrl.includes('?') ? '&' : '?';
    const url = `${serverUrl}${sep}user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `Composio MCP ${method} -> ${res.status} ${text.slice(0, 160)}`,
      );
    }

    return this.parseMcpBody(text);
  }

  // Composio's MCP server replies with SSE frames ("data: {json}"); return the
  // JSON-RPC message carrying the result/error.
  private parseMcpBody(text: string): { result?: any; error?: any } {
    const frames: { result?: any; error?: any }[] = [];

    for (const line of text.split('\n')) {
      const trimmed = line.trim();

      if (!trimmed.startsWith('data:')) {
        continue;
      }

      try {
        frames.push(JSON.parse(trimmed.slice(5).trim()));
      } catch {
        // skip keepalive / non-JSON frames
      }
    }

    if (frames.length === 0) {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    }

    return (
      frames.find(
        (frame) =>
          frame && (frame.result !== undefined || frame.error !== undefined),
      ) ?? frames[frames.length - 1]
    );
  }

  private async getMcpToolkitTools(
    toolkit: ComposioToolkit,
    userId: string,
  ): Promise<{ tools: ComposioTool[]; schemas: Record<string, object> }> {
    const cached = this.mcpToolsCache.get(toolkit.slug);

    if (cached) {
      return cached;
    }
    // tools/list returns static schemas and needs no connection, so any user id
    // resolves the same catalog.
    const payload = await this.mcpRequest(
      toolkit.mcpServerUrl as string,
      userId,
      'tools/list',
      {},
    );
    const listed = (payload?.result?.tools ?? []) as {
      name?: string;
      description?: string;
      inputSchema?: object;
    }[];
    const tools: ComposioTool[] = [];
    const schemas: Record<string, object> = {};

    for (const tool of listed) {
      if (!tool?.name) {
        continue;
      }
      tools.push({ slug: tool.name, description: tool.description ?? '' });

      if (tool.inputSchema) {
        schemas[tool.name] = tool.inputSchema;
      }
    }
    const result = { tools, schemas };

    // Only cache a non-empty catalog (a transient failure returns nothing).
    if (tools.length > 0) {
      this.mcpToolsCache.set(toolkit.slug, result);
    }

    return result;
  }

  private async executeMcp(
    toolkit: ComposioToolkit,
    userId: string,
    toolSlug: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    try {
      const payload = await this.mcpRequest(
        toolkit.mcpServerUrl as string,
        userId,
        'tools/call',
        { name: toolSlug, arguments: args ?? {} },
      );

      if (payload?.error) {
        return {
          ok: false,
          error:
            typeof payload.error === 'string'
              ? payload.error
              : JSON.stringify(payload.error),
        };
      }
      const result = (payload?.result ?? {}) as {
        content?: { type?: string; text?: string }[];
        structuredContent?: unknown;
        isError?: boolean;
      };
      const text = (result.content ?? [])
        .filter((block) => block?.type === 'text' && Boolean(block.text))
        .map((block) => block.text)
        .join('\n');

      if (result.isError) {
        return { ok: false, error: text || 'Granola tool returned an error' };
      }

      return {
        ok: true,
        data: result.structuredContent ?? (text ? { text } : result),
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
