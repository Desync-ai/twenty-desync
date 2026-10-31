import { isObject, isString } from '@sniptt/guards';

// The same REST call twenty-server's ComposioService makes
// (core-modules/composio/composio.service.ts): one POST per tool, the platform
// key in x-api-key, the connected account picked by user_id.
const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

export type ComposioResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export const executeComposioTool = async ({
  apiKey,
  userId,
  toolSlug,
  toolArguments,
  fetchImplementation = fetch,
}: {
  apiKey: string;
  userId: string;
  toolSlug: string;
  toolArguments: Record<string, unknown>;
  fetchImplementation?: typeof fetch;
}): Promise<ComposioResult> => {
  let response: Response;

  try {
    response = await fetchImplementation(
      `${COMPOSIO_BASE_URL}/tools/execute/${encodeURIComponent(toolSlug)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ user_id: userId, arguments: toolArguments }),
      },
    );
  } catch (error) {
    return {
      ok: false,
      error: `Composio could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: `Composio returned a non-JSON response (HTTP ${response.status}).`,
    };
  }

  const reply = isObject(body) ? (body as Record<string, unknown>) : {};

  if (!response.ok || (reply.error !== undefined && reply.error !== null)) {
    const error = isString(reply.error)
      ? reply.error
      : JSON.stringify(
          reply.error ?? reply.message ?? `HTTP ${response.status}`,
        );

    return { ok: false, error: error.slice(0, 300) };
  }

  if (reply.successful === false) {
    return { ok: false, error: `${toolSlug} did not succeed.` };
  }

  return { ok: true, data: reply.data ?? reply };
};
