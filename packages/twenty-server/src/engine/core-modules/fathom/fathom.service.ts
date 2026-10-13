import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { KeyValuePairType } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import {
  FATHOM_API_KEY_KV,
  FATHOM_MCP_PROTOCOL_VERSION,
  FATHOM_MCP_URL,
} from 'src/engine/core-modules/fathom/constants/fathom.constants';

export type FathomTool = {
  name: string;
  description: string;
  inputSchema: object;
};

type McpBody = { result?: any; error?: any };

// Direct client for Fathom's (fathom.video) official MCP server. NOT a Composio
// integration: each user brings their own Fathom API key (Fathom Settings ->
// API), stored user-scoped + encrypted in KeyValuePair, and we talk straight to
// Fathom's MCP endpoint with an `X-Fathom-Api-Key` header. Surfaced to the
// copilot via FathomToolProvider. Same shape as PocketService.
@Injectable()
export class FathomService {
  private readonly logger = new Logger(FathomService.name);
  private readonly sessions = new Map<
    string,
    { id: string | undefined; at: number }
  >();
  private static readonly SESSION_TTL_MS = 5 * 60 * 1000;
  // Per-user tool-list cache (NOT global); cleared on connect/disconnect.
  private readonly toolsCache = new Map<
    string,
    { at: number; tools: FathomTool[] }
  >();
  private static readonly TOOLS_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly keyValuePairService: KeyValuePairService,
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  async getApiKey(userId: string): Promise<string | null> {
    if (!userId) {
      return null;
    }
    const rows = await this.keyValuePairService.get({
      userId,
      workspaceId: null,
      applicationId: null,
      type: KeyValuePairType.USER_VARIABLE,
      key: FATHOM_API_KEY_KV,
    });
    const value = rows.length > 0 ? (rows[0]?.value as { apiKey?: string }) : null;
    const stored = value?.apiKey?.trim();
    if (!stored) {
      return null;
    }
    try {
      // Stored encrypted at rest with the authenticated AES-GCM v2 envelope.
      return (
        this.secretEncryptionService.decryptVersionedOrThrow(
          stored as EncryptedString,
        ) || null
      );
    } catch {
      try {
        return this.secretEncryptionService.decrypt(stored) || null;
      } catch {
        return null;
      }
    }
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.getApiKey(userId)) !== null;
  }

  // Store (and validate) a user's Fathom key. Validation is a live tools/list
  // against Fathom's MCP (Fathom keys have no fixed prefix to check).
  async connect(userId: string, apiKey: string): Promise<{ connected: true }> {
    const key = (apiKey ?? '').trim();
    if (!key) {
      throw new BadRequestException('Provide your Fathom API key.');
    }
    const ok = await this.validateKey(key);
    if (!ok) {
      throw new BadRequestException(
        'Fathom rejected that API key. Check it in Fathom Settings > API.',
      );
    }
    await this.keyValuePairService.set({
      userId,
      workspaceId: null,
      applicationId: null,
      key: FATHOM_API_KEY_KV,
      type: KeyValuePairType.USER_VARIABLE,
      value: {
        apiKey: this.secretEncryptionService.encryptVersioned(
          key as PlaintextString,
        ),
        connectedAt: new Date().toISOString(),
      },
    });
    this.sessions.delete(userId);
    this.toolsCache.delete(userId);

    return { connected: true };
  }

  async disconnect(userId: string): Promise<void> {
    await this.keyValuePairService.set({
      userId,
      workspaceId: null,
      applicationId: null,
      key: FATHOM_API_KEY_KV,
      type: KeyValuePairType.USER_VARIABLE,
      value: null,
    });
    this.sessions.delete(userId);
    this.toolsCache.delete(userId);
  }

  // The tools Fathom exposes for this user (search meetings, get transcript,
  // get summary, etc.). Returns [] if not connected or Fathom is unreachable.
  async listTools(userId: string): Promise<FathomTool[]> {
    const apiKey = await this.getApiKey(userId);
    if (!apiKey) {
      return [];
    }
    const cached = this.toolsCache.get(userId);
    if (cached && Date.now() - cached.at < FathomService.TOOLS_TTL_MS) {
      return cached.tools;
    }
    try {
      const payload = await this.call(userId, apiKey, 'tools/list', {});
      const listed = (payload?.result?.tools ?? []) as {
        name?: string;
        description?: string;
        inputSchema?: object;
      }[];
      const tools: FathomTool[] = [];
      for (const tool of listed) {
        if (!tool?.name) {
          continue;
        }
        tools.push({
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        });
      }
      if (tools.length > 0) {
        this.toolsCache.set(userId, { at: Date.now(), tools });
      }

      return tools;
    } catch (error) {
      this.logger.warn(`Fathom tools/list failed: ${(error as Error).message}`);

      return [];
    }
  }

  async execute(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: object; error?: string }> {
    const apiKey = await this.getApiKey(userId);
    if (!apiKey) {
      return { ok: false, error: 'Fathom is not connected for this user.' };
    }
    try {
      const payload = await this.call(userId, apiKey, 'tools/call', {
        name: toolName,
        arguments: args ?? {},
      });
      if (payload?.error) {
        return {
          ok: false,
          error:
            (payload.error?.message as string) ?? 'Fathom tool call failed.',
        };
      }
      const result = (payload?.result ?? {}) as { isError?: boolean };

      return { ok: !result.isError, data: result };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  private async validateKey(apiKey: string): Promise<boolean> {
    try {
      const payload = await this.call('validate', apiKey, 'tools/list', {});

      return !payload?.error;
    } catch (error) {
      this.logger.warn(`Fathom key validation failed: ${(error as Error).message}`);

      return false;
    }
  }

  // --- MCP transport (streamable HTTP; SSE or JSON responses) ----------------

  private async ensureSession(
    userId: string,
    apiKey: string,
  ): Promise<string | undefined> {
    const cached = this.sessions.get(userId);
    if (cached && Date.now() - cached.at < FathomService.SESSION_TTL_MS) {
      return cached.id;
    }
    const { res, body } = await this.mcpFetch(apiKey, 'initialize', {
      protocolVersion: FATHOM_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'desync-crm', version: '1.0.0' },
    });
    const sessionId = res.headers.get('mcp-session-id') ?? undefined;
    this.sessions.set(userId, { id: sessionId, at: Date.now() });
    if (!body?.error && sessionId) {
      await this.mcpFetch(apiKey, 'notifications/initialized', {}, sessionId).catch(
        () => undefined,
      );
    }

    return sessionId;
  }

  private async call(
    userId: string,
    apiKey: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<McpBody> {
    const sessionId = await this.ensureSession(userId, apiKey);
    const { res, body } = await this.mcpFetch(apiKey, method, params, sessionId);
    if ((res.status === 400 || res.status === 404) && method !== 'initialize') {
      this.sessions.delete(userId);
      const freshSession = await this.ensureSession(userId, apiKey);
      const retry = await this.mcpFetch(apiKey, method, params, freshSession);
      if (!retry.res.ok) {
        throw new Error(
          `Fathom MCP ${method} -> ${retry.res.status} ${retry.text.slice(0, 160)}`,
        );
      }

      return retry.body;
    }
    if (!res.ok) {
      throw new Error(
        `Fathom MCP ${method} -> ${res.status} ${JSON.stringify(body).slice(0, 160)}`,
      );
    }

    return body;
  }

  private async mcpFetch(
    apiKey: string,
    method: string,
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<{ res: Response; body: McpBody; text: string }> {
    const isNotification = method.startsWith('notifications/');
    const headers: Record<string, string> = {
      'x-fathom-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }
    const res = await fetch(FATHOM_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        ...(isNotification ? {} : { id: 1 }),
        method,
        params,
      }),
    });
    const text = await res.text();

    return { res, body: this.parseMcpBody(text), text };
  }

  private parseMcpBody(text: string): McpBody {
    const frames: McpBody[] = [];
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
        return JSON.parse(text) as McpBody;
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
}
