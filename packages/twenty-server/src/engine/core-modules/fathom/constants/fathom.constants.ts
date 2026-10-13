// Fathom (fathom.video) integration constants.
//
// Fathom is an AI meeting notetaker. We wire its official PUBLIC MCP server
// DIRECTLY (NOT through Composio, whose Fathom toolkit has auth but 0 runnable
// tools as of 2026-10): each user brings their own Fathom API key (from Fathom
// Settings -> API) and the CRM copilot talks straight to Fathom's MCP endpoint.

// Fathom's public MCP server (streamable HTTP). Overridable via env.
export const FATHOM_MCP_URL =
  process.env.FATHOM_MCP_URL || 'https://api.fathom.ai/mcp';

// Per-user KeyValuePair slot holding the user's Fathom API key, encrypted at
// rest (user-scoped: userId set, workspaceId null). A Fathom account is
// personal, so the key follows the user across their workspaces.
export const FATHOM_API_KEY_KV = 'FATHOM_API_KEY';

// MCP protocol version we advertise on initialize; the server negotiates back.
export const FATHOM_MCP_PROTOCOL_VERSION = '2025-06-18';
