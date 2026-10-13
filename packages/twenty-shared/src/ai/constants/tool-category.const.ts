export enum ToolCategory {
  DATABASE_CRUD = 'DATABASE_CRUD',
  ACTION = 'ACTION',
  WORKFLOW = 'WORKFLOW',
  METADATA = 'METADATA',
  VIEW = 'VIEW',
  DASHBOARD = 'DASHBOARD',
  NAVIGATION_MENU_ITEM = 'NAVIGATION_MENU_ITEM',
  WEBHOOK = 'WEBHOOK',
  LOGIC_FUNCTION = 'LOGIC_FUNCTION',
  ROLE = 'ROLE',
  // Desync fork: Composio-backed external SaaS tools (e.g. Slack) the copilot
  // can call on the user's behalf. Each provider owns a UNIQUE category because
  // the executor dispatches static tools by `descriptor.category`.
  COMPOSIO = 'COMPOSIO',
  // Desync fork: Pocket (heypocketai.com) meeting-capture tools, wired DIRECTLY
  // to Pocket's own MCP server (NOT via Composio), per-user bring-your-own-key.
  POCKET = 'POCKET',
}
