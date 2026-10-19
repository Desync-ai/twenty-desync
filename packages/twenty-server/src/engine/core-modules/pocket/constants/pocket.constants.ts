// Pocket (heypocketai.com) integration constants.
//
// Pocket is a meeting-capture device + app. We wire its PUBLIC MCP server
// DIRECTLY (NOT through Composio): each user brings their own Pocket API key
// (pk_..., from Pocket Settings -> Developer -> API Keys) and the CRM copilot
// talks straight to Pocket's MCP endpoint on that user's behalf.

// Pocket's public MCP server (streamable HTTP + SSE framing). Overridable via
// env in case Pocket moves it.
export const POCKET_MCP_URL =
  process.env.POCKET_MCP_URL || 'https://public.heypocketai.com/mcp';

// Per-user KeyValuePair slot holding the user's Pocket API key (user-scoped:
// userId set, workspaceId null). A Pocket account/device is personal, so the
// key follows the user across their workspaces.
export const POCKET_API_KEY_KV = 'POCKET_API_KEY';

// MCP protocol version we advertise on initialize (Pocket uses streamable HTTP,
// introduced in the 2025 revisions). The server negotiates its own version back.
export const POCKET_MCP_PROTOCOL_VERSION = '2025-06-18';

// Pocket API keys are documented to start with this prefix.
export const POCKET_KEY_PREFIX = 'pk_';
