// Workspace key-value-pair key under which we record which AI client
// (Claude / Cursor / ChatGPT / Grok) last connected to the MCP server, keyed by
// API key id: value is { [apiKeyId]: { name: string; lastSeenAt: string } }.
// Written on the MCP `initialize` handshake, read back by the integrations page
// to show per-client active-connection counts. Scoped userId:null + the
// workspace id, type USER_VARIABLE (reuses the existing KV type enum).
export const MCP_CLIENT_CONNECTIONS_KV_KEY = 'MCP_CLIENT_CONNECTIONS';
