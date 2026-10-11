import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { MCP_CLIENT_CONNECTIONS_KV_KEY } from 'src/engine/api/mcp/constants/mcp-client-connections-kv-key.const';
import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import { ComposioService } from 'src/engine/core-modules/composio/composio.service';
import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';

/**
 * Server-to-server client for the private `twenty-corsair` service (Corsair Hub
 * OAuth + HubSpot->Twenty mapping) plus the workspace write-token minting the
 * sync needs.
 *
 * twenty-server holds NO integration business logic — corsair owns the mapping.
 * The only Twenty-side concern here is auth: session tokens are cookie-only and
 * are never accepted as Bearer, so we mint a short-lived, workspace-scoped
 * API-key token and hand it to corsair to write records back through /rest.
 *
 * Config (env on the server/worker service):
 *   CORSAIR_BASE_URL      e.g. https://twenty-corsair-dev.onrender.com
 *   CORSAIR_SERVICE_TOKEN shared secret matching the corsair service
 *   SERVER_URL            this instance's public URL (corsair calls it back)
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly baseUrl = (process.env.CORSAIR_BASE_URL ?? '').replace(/\/+$/, '');
  private readonly serviceToken = process.env.CORSAIR_SERVICE_TOKEN ?? '';
  // Feedback / integration-request emails go to the team via Resend (the same
  // provider + verified sender the lead-gen platform uses).
  private readonly resendKey = process.env.RESEND_KEY ?? process.env.RESEND_API_KEY ?? '';
  private static readonly FEEDBACK_FROM = 'Desync CRM <noreply@desync.support>';
  private static readonly FEEDBACK_TO = ['mark@desync.ai', 'jackson@desync.ai'];

  // One reusable write key per provider, named so Twenty's "Created by" shows the
  // source (HubSpot / Salesforce) — never an internal tool name.
  private static readonly KEY_NAMES: Record<string, string> = {
    hubspot: 'HubSpot',
    salesforce: 'Salesforce',
    desync: 'Desync',
  };

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly roleService: RoleService,
    private readonly composioService: ComposioService,
    private readonly keyValuePairService: KeyValuePairService,
  ) {}

  // Desync: per-AI-client active MCP connection counts for the integrations page.
  // Reads the workspace KV map the MCP initialize handshake stamps (apiKeyId ->
  // { name, lastSeenAt }), keeps only entries whose API key is still active
  // (non-revoked + non-expired), and buckets by client. Self-reported client
  // name, so it's a best-effort signal; unknowns fall into "other".
  async mcpConnectionCounts(workspaceId: string): Promise<Record<string, number>> {
    const rows = await this.keyValuePairService.get({
      userId: null,
      workspaceId,
      applicationId: null,
      key: MCP_CLIENT_CONNECTIONS_KV_KEY,
      type: KeyValuePairType.USER_VARIABLE,
    });
    const connectionsByApiKeyId = (rows[0]?.value ?? {}) as Record<
      string,
      { name?: string; lastSeenAt?: string }
    >;

    const activeKeys = await this.apiKeyService.findActiveByWorkspaceId(
      workspaceId,
    );
    const now = Date.now();
    const activeApiKeyIds = new Set(
      activeKeys
        .filter((k) => !k.expiresAt || new Date(k.expiresAt).getTime() > now)
        .map((k) => k.id),
    );

    const counts: Record<string, number> = {};

    for (const [apiKeyId, info] of Object.entries(connectionsByApiKeyId)) {
      if (!activeApiKeyIds.has(apiKeyId)) {
        continue;
      }

      const name = (info?.name ?? '').toLowerCase();
      const bucket = name.includes('claude')
        ? 'claude'
        : name.includes('cursor')
          ? 'cursor'
          : name.includes('chatgpt') || name.includes('openai')
            ? 'chatgpt'
            : name.includes('grok')
              ? 'grok'
              : 'other';

      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    return counts;
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.serviceToken);
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new Error(
        'Integrations service is not configured (CORSAIR_BASE_URL / CORSAIR_SERVICE_TOKEN)',
      );
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': this.serviceToken,
      },
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
      throw new Error(json?.error ?? `corsair responded ${res.status}`);
    }
    return json as T;
  }

  // `email` is only used by the Desync (Gabriel CRM) source, which resolves the
  // user's workspace by email rather than an OAuth account.
  async status(tenant: string, plugin: string, email?: string, userId?: string) {
    // Composio-backed copilot integrations (Slack, Airtable, …) are per-user,
    // keyed by the Twenty user id — not Corsair sync sources.
    if (this.composioService.isToolkitEnabled(plugin)) {
      const connected = userId
        ? await this.composioService.isConnected(plugin, userId)
        : false;

      return { plugin, connected };
    }
    const emailQs =
      plugin === 'desync' && email ? `&email=${encodeURIComponent(email)}` : '';

    return this.call<{ plugin: string; connected: boolean }>(
      'GET',
      `/integrations/${encodeURIComponent(plugin)}/status?userId=${encodeURIComponent(tenant)}${emailQs}`,
    );
  }

  async connect(tenant: string, plugin: string, email?: string, userId?: string) {
    // Composio toolkits (Slack, Airtable, …) connect via Composio's hosted OAuth,
    // keyed by the Twenty user id (the same id the copilot executes against).
    if (this.composioService.isToolkitEnabled(plugin)) {
      if (!userId) {
        throw new BadRequestException('No user in session for this connection');
      }

      return this.composioService.getConnectUrl(plugin, userId);
    }

    return this.call<{ connectUrl: string | null; connected?: boolean; expiresAt: string | null }>(
      'POST',
      `/integrations/${encodeURIComponent(plugin)}/connect`,
      { userId: tenant, ...(plugin === 'desync' && email ? { email } : {}) },
    );
  }

  // Send a user's integration request / bug report / feedback to the team via Resend.
  async feedback(
    kind: 'request' | 'problem' | 'bug' | 'feedback',
    message: string,
    fromEmail?: string,
    severity?: 1 | 2 | 3,
  ): Promise<{ ok: boolean }> {
    if (!this.resendKey) {
      throw new Error('Feedback email is not configured (RESEND_KEY)');
    }
    const label =
      kind === 'request'
        ? 'Integration request'
        : kind === 'bug'
          ? 'Bug report'
          : kind === 'feedback'
            ? 'Feedback'
            : 'Problem report';
    const severityText =
      severity !== undefined
        ? { 1: '1 (Critical)', 2: '2 (Major)', 3: '3 (Minor)' }[severity]
        : undefined;
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html =
      `<p><strong>${label}</strong>` +
      (severityText ? ` (severity ${escape(severityText)})` : '') +
      ` from ${escape(fromEmail ?? 'a Twenty CRM user')}:</p>` +
      `<p style="white-space:pre-wrap">${escape(message)}</p>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: IntegrationsService.FEEDBACK_FROM,
        to: IntegrationsService.FEEDBACK_TO,
        ...(fromEmail ? { reply_to: fromEmail } : {}),
        subject:
          `Desync CRM: ${label}` + (severity !== undefined ? ` (S${severity})` : ''),
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Resend responded ${res.status}: ${text.slice(0, 200)}`);
    }
    return { ok: true };
  }

  async sync(tenant: string, workspaceId: string, plugin: string, email?: string) {
    // Allow-list the plugin BEFORE minting any key. Otherwise an arbitrary
    // `:plugin` would create a persistent named write-key for a bogus integration
    // (keyName falls back to the raw plugin string).
    if (!Object.prototype.hasOwnProperty.call(IntegrationsService.KEY_NAMES, plugin)) {
      throw new BadRequestException(`Unsupported integration: ${plugin}`);
    }
    const twentyApiUrl = (process.env.SERVER_URL ?? '').replace(/\/+$/, '');
    if (!twentyApiUrl) {
      throw new Error('SERVER_URL is not configured');
    }
    // Name the write key after the provider so records' "Created by" reads
    // "HubSpot" / "Salesforce".
    const keyName = IntegrationsService.KEY_NAMES[plugin] ?? plugin;
    const twentyToken = await this.mintWriteToken(workspaceId, keyName);

    // Returns { ok, jobId, status } — the sync runs as a background job in corsair;
    // the UI polls syncStatus() for progress.
    return this.call<{ ok: boolean; jobId: string; status: string }>(
      'POST',
      `/integrations/${encodeURIComponent(plugin)}/sync`,
      { userId: tenant, twentyApiUrl, twentyToken, ...(plugin === 'desync' && email ? { email } : {}) },
    );
  }

  syncStatus(tenant: string, plugin: string) {
    return this.call<{ status: string; phase: string | null; counts: unknown; error: string | null }>(
      'GET',
      `/integrations/${encodeURIComponent(plugin)}/sync/status?userId=${encodeURIComponent(tenant)}`,
    );
  }

  // Find-or-create a named workspace API key with write access, then mint a
  // short-lived token from it for corsair to use against /rest.
  private async mintWriteToken(workspaceId: string, keyName: string): Promise<string> {
    const now = Date.now();
    const activeKeys = await this.apiKeyService.findActiveByWorkspaceId(workspaceId);

    let key = activeKeys.find(
      (k) => k.name === keyName && new Date(k.expiresAt).getTime() > now,
    );

    if (!key) {
      const roles = await this.roleService.getWorkspaceRoles(workspaceId);
      const writerRole = roles.find((r) => r.canUpdateAllSettings) ?? roles[0];
      if (!writerRole) {
        throw new Error('No writable role available in this workspace');
      }
      key = await this.apiKeyService.create({
        name: keyName,
        expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        roleId: writerRole.id,
        workspaceId,
      });
    }

    // 12h: a background sync of a large CRM can run long; the token must outlive it.
    const minted = await this.apiKeyService.generateApiKeyToken(
      workspaceId,
      key.id,
      new Date(now + 12 * 60 * 60 * 1000),
    );
    if (!minted?.token) {
      throw new Error('Failed to mint workspace API token');
    }
    return minted.token;
  }
}
