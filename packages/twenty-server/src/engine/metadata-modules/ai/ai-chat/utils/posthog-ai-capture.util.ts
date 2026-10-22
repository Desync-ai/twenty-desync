import { Logger } from '@nestjs/common';

/**
 * Desync: fire-and-forget PostHog capture for the CRM copilot (agent-chat).
 *
 * Dependency-free on purpose — twenty-server has no posthog-node package and we
 * do NOT want to add one (the fork's local yarn is broken). This posts a single
 * event to PostHog's capture API with `fetch` and FAILS OPEN: a PostHog outage,
 * misconfig, or slow network can never affect a chat turn (short timeout +
 * swallow every error; the call is never awaited by the stream).
 *
 * Config via process.env (same pattern as DesyncAiBudgetService, NOT
 * config-variables.ts):
 *   - POSTHOG_API_KEY: PostHog project ingestion key (public/write-only, safe to
 *     embed, same key a web snippet uses). Defaults to the Desync project key.
 *     Set to "" to disable capture on a service.
 *   - POSTHOG_HOST:    ingestion host (default https://us.i.posthog.com).
 *   - POSTHOG_ENV:     value for the `env` property (default NODE_ENV), set per
 *     Render service (dev-east / prod) so environments are separable.
 *
 * Events use PostHog LLM-analytics names ($ai_trace per turn, $ai_generation per
 * step) with the standard $ai_* props the LLM-analytics UI reads.
 */

const logger = new Logger('PosthogAiCapture');

const POSTHOG_TIMEOUT_MS = 2000;
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const DEFAULT_POSTHOG_API_KEY =
  'phc_nsELc7hcobhMd2wf3qstga6vBX5KWq6NVvPTVDdYp8Q6';

export type PosthogAiEventName = '$ai_trace' | '$ai_generation';

export type PosthogAiCaptureInput = {
  event: PosthogAiEventName;
  distinctId: string;
  traceId: string;
  spanName: string;
  model: string;
  provider: string;
  // PostHog LLM analytics expects $ai_latency in SECONDS.
  latencySeconds: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  tier?: string;
  step?: number;
  workspaceId: string;
};

const getApiKey = (): string | undefined => {
  const key = process.env.POSTHOG_API_KEY ?? DEFAULT_POSTHOG_API_KEY;

  return key.trim() !== '' ? key.trim() : undefined;
};

const getHost = (): string => {
  const host = process.env.POSTHOG_HOST;

  return (
    host && host.trim() !== '' ? host.trim() : DEFAULT_POSTHOG_HOST
  ).replace(/\/+$/, '');
};

const getEnv = (): string =>
  process.env.POSTHOG_ENV ?? process.env.NODE_ENV ?? 'development';

/**
 * Fire-and-forget. Never throws, never rejects, callers may `void` it. No-op
 * when POSTHOG_API_KEY resolves empty.
 */
export const capturePosthogAiEvent = async (
  input: PosthogAiCaptureInput,
): Promise<void> => {
  const apiKey = getApiKey();

  if (!apiKey) {
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POSTHOG_TIMEOUT_MS);

  try {
    const properties: Record<string, unknown> = {
      $ai_trace_id: input.traceId,
      $ai_span_name: input.spanName,
      $ai_model: input.model,
      $ai_provider: input.provider,
      $ai_latency: input.latencySeconds,
      $ai_input_tokens: input.inputTokens,
      $ai_output_tokens: input.outputTokens,
      $ai_total_cost_usd: input.totalCostUsd,
      app: 'crm-copilot',
      env: getEnv(),
      workspace_id: input.workspaceId,
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
      ...(input.step !== undefined ? { step: input.step } : {}),
    };

    const response = await fetch(`${getHost()}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: input.event,
        distinct_id: input.distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        `PostHog capture returned ${response.status} for event ${input.event}`,
      );
    }
  } catch (error) {
    // Fail open: telemetry must never affect the chat.
    logger.warn(
      `PostHog capture failed (non-fatal): ${(error as Error)?.message}`,
    );
  } finally {
    clearTimeout(timer);
  }
};
