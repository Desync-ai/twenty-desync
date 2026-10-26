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
//   COMPOSIO_GMAIL_AUTH_CONFIG_ID         managed-OAuth auth config for Gmail (ac_...)
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
  // Org-wide toolkits are backed by OUR own shared key (not a per-user OAuth /
  // API-key connection): their tools are available to every user, executed under
  // `serviceUserId`, and they render NO per-user "Connect" card.
  orgWide?: boolean;
  serviceUserId?: string;
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
    description:
      'List channels/conversations in the connected Slack workspace.',
  },
  {
    slug: 'SLACK_FETCH_CONVERSATION_HISTORY',
    description:
      'Fetch recent messages from a Slack channel. Requires `channel`.',
  },
  {
    slug: 'SLACK_SEARCH_MESSAGES',
    description:
      'Search messages across the Slack workspace. Requires a `query`.',
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
    description:
      'Get a single Airtable record by id (base id, table, record id).',
  },
  {
    slug: 'AIRTABLE_CREATE_RECORD',
    description:
      'Create a record in an Airtable table (base id, table, fields).',
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

// Curated Gmail tools exposed to the copilot — READ-ONLY, so the assistant can
// answer questions about the user's inbox without sending or modifying mail.
export const COMPOSIO_GMAIL_TOOLS: ComposioTool[] = [
  {
    slug: 'GMAIL_FETCH_EMAILS',
    description:
      "Search/list the user's emails. Supports a Gmail search `query` (e.g. from:, subject:, newer_than:1d, is:unread, has:attachment) plus pagination. Use this to find or summarize emails.",
  },
  {
    slug: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
    description: 'Fetch the full content of a single email by its message id.',
  },
  {
    slug: 'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
    description: 'Fetch all messages in an email thread by its thread id.',
  },
  {
    slug: 'GMAIL_LIST_THREADS',
    description:
      'List email threads, optionally filtered by a Gmail search `query`.',
  },
  {
    slug: 'GMAIL_LIST_LABELS',
    description: "List the account's Gmail labels / folders.",
  },
  {
    slug: 'GMAIL_GET_PROFILE',
    description:
      'Get the connected Gmail account profile (email address, message/thread totals).',
  },
];

// Curated Outlook (Microsoft 365) tools — mail read/search + calendar. Email is
// read-only; calendar create is allowed.
export const COMPOSIO_OUTLOOK_TOOLS: ComposioTool[] = [
  {
    slug: 'OUTLOOK_OUTLOOK_LIST_MESSAGES',
    description:
      "List the user's Outlook emails (optionally by folder), newest first.",
  },
  {
    slug: 'OUTLOOK_OUTLOOK_SEARCH_MESSAGES',
    description: 'Search the mailbox by sender, subject, keywords, or dates.',
  },
  {
    slug: 'OUTLOOK_OUTLOOK_GET_MESSAGE',
    description: 'Fetch the full content of one Outlook email by id.',
  },
  {
    slug: 'OUTLOOK_OUTLOOK_LIST_MAIL_FOLDERS',
    description: 'List the mailbox folders.',
  },
  {
    slug: 'OUTLOOK_OUTLOOK_LIST_EVENTS',
    description: "List events on the user's Outlook calendar for a time range.",
  },
  {
    slug: 'OUTLOOK_OUTLOOK_GET_EVENT',
    description: 'Get a single Outlook calendar event by id.',
  },
  {
    slug: 'OUTLOOK_OUTLOOK_CALENDAR_CREATE_EVENT',
    description:
      'Create an Outlook calendar event (subject, attendees, start/end).',
  },
  {
    slug: 'OUTLOOK_OUTLOOK_GET_PROFILE',
    description: 'Get the connected Outlook account profile (name, email).',
  },
];

// Curated Google Calendar tools — read schedule, free/busy, manage events.
export const COMPOSIO_GOOGLECALENDAR_TOOLS: ComposioTool[] = [
  {
    slug: 'GOOGLECALENDAR_FIND_EVENT',
    description:
      "Find/list events on the user's calendar by time range or text query.",
  },
  {
    slug: 'GOOGLECALENDAR_FREE_BUSY_QUERY',
    description: 'Check when the user is free or busy across a time range.',
  },
  {
    slug: 'GOOGLECALENDAR_GET_CALENDAR',
    description: "Get metadata for one of the user's calendars.",
  },
  {
    slug: 'GOOGLECALENDAR_CREATE_EVENT',
    description:
      'Create a calendar event (title, attendees, start/end, conferencing).',
  },
  {
    slug: 'GOOGLECALENDAR_UPDATE_EVENT',
    description: 'Update or reschedule an existing calendar event.',
  },
  {
    slug: 'GOOGLECALENDAR_DELETE_EVENT',
    description: 'Delete/cancel a calendar event by id.',
  },
];

// Curated Notion tools — search + read pages/databases, create pages.
export const COMPOSIO_NOTION_TOOLS: ComposioTool[] = [
  {
    slug: 'NOTION_SEARCH_NOTION_PAGE',
    description:
      "Search the user's Notion workspace for pages/databases by title.",
  },
  {
    slug: 'NOTION_FETCH_DATA',
    description: 'Fetch a Notion page with its properties and content.',
  },
  {
    slug: 'NOTION_FETCH_BLOCK_CONTENTS',
    description: 'Fetch the block contents (text) of a Notion page/block.',
  },
  {
    slug: 'NOTION_QUERY_DATABASE',
    description: 'Query rows of a Notion database with filters and sorts.',
  },
  {
    slug: 'NOTION_FETCH_DATABASE',
    description: 'Fetch a Notion database schema/metadata.',
  },
  {
    slug: 'NOTION_CREATE_NOTION_PAGE',
    description: 'Create a new Notion page (title, parent, content).',
  },
];

// Curated Calendly tools — scheduled events, availability, booking links.
export const COMPOSIO_CALENDLY_TOOLS: ComposioTool[] = [
  {
    slug: 'CALENDLY_GET_CURRENT_USER',
    description:
      'Get the connected Calendly user (needed to scope other calls).',
  },
  {
    slug: 'CALENDLY_LIST_EVENTS',
    description: "List the user's scheduled Calendly events by status or time.",
  },
  {
    slug: 'CALENDLY_GET_EVENT',
    description: 'Get details of one scheduled Calendly event.',
  },
  {
    slug: 'CALENDLY_LIST_EVENT_INVITEES',
    description: 'List invitees/attendees of a scheduled event.',
  },
  {
    slug: 'CALENDLY_LIST_USER_S_EVENT_TYPES',
    description: "List the user's Calendly event types (meeting templates).",
  },
  {
    slug: 'CALENDLY_CREATE_SINGLE_USE_SCHEDULING_LINK',
    description: 'Create a single-use booking link for an event type.',
  },
];

// Curated Microsoft Teams tools — read teams/channels/messages + create meetings.
export const COMPOSIO_MICROSOFT_TEAMS_TOOLS: ComposioTool[] = [
  {
    slug: 'MICROSOFT_TEAMS_GET_TEAM',
    description: 'Get a Microsoft Teams team by id.',
  },
  {
    slug: 'MICROSOFT_TEAMS_GET_CHANNEL',
    description: 'Get a channel in a team.',
  },
  {
    slug: 'MICROSOFT_TEAMS_GET_CHAT_MESSAGE',
    description: 'Get a specific chat or channel message.',
  },
  {
    slug: 'MICROSOFT_TEAMS_LIST_MESSAGE_REPLIES',
    description: 'List replies to a channel message.',
  },
  {
    slug: 'MICROSOFT_TEAMS_LIST_TEAM_MEMBERS',
    description: 'List members of a team.',
  },
  {
    slug: 'MICROSOFT_TEAMS_CREATE_MEETING',
    description: 'Create a Teams online meeting (subject, start/end).',
  },
];

// Curated Google Drive tools — find/read files + create files/folders & upload.
// (Delete and external-sharing are intentionally left out.)
export const COMPOSIO_GOOGLEDRIVE_TOOLS: ComposioTool[] = [
  {
    slug: 'GOOGLEDRIVE_FIND_FILE',
    description: "Find files in the user's Drive by name or query.",
  },
  {
    slug: 'GOOGLEDRIVE_LIST_FILES',
    description: 'List files/folders in Drive, optionally filtered.',
  },
  {
    slug: 'GOOGLEDRIVE_FIND_FOLDER',
    description: 'Find folders by name or query.',
  },
  {
    slug: 'GOOGLEDRIVE_GET_FILE_METADATA',
    description: "Get a file's metadata (name, type, owners, links).",
  },
  {
    slug: 'GOOGLEDRIVE_PARSE_FILE',
    description:
      'Extract the text content of a Drive file (docs/pdf) so the assistant can read it.',
  },
  {
    slug: 'GOOGLEDRIVE_CREATE_FILE_FROM_TEXT',
    description:
      'Create a new Drive file (e.g. a doc) from text content, optionally in a folder.',
  },
  {
    slug: 'GOOGLEDRIVE_CREATE_FOLDER',
    description: 'Create a folder in Drive, optionally within a parent folder.',
  },
  {
    slug: 'GOOGLEDRIVE_UPLOAD_FILE',
    description: 'Upload a file (max 5MB) to Drive, optionally into a folder.',
  },
];

// Curated Google Sheets tools — find sheets, read values, append rows.
export const COMPOSIO_GOOGLESHEETS_TOOLS: ComposioTool[] = [
  {
    slug: 'GOOGLESHEETS_SEARCH_SPREADSHEETS',
    description: "Search the user's Google Sheets by name.",
  },
  {
    slug: 'GOOGLESHEETS_GET_SPREADSHEET_INFO',
    description: "Get a spreadsheet's metadata (sheets, title, ids).",
  },
  {
    slug: 'GOOGLESHEETS_GET_SHEET_NAMES',
    description: 'List the tab/sheet names in a spreadsheet.',
  },
  {
    slug: 'GOOGLESHEETS_BATCH_GET',
    description: 'Read cell values from one or more ranges.',
  },
  {
    slug: 'GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW',
    description: 'Find a row matching a value.',
  },
  {
    slug: 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND',
    description: 'Append a row of values to a sheet.',
  },
];

// Curated Instantly tools — cold-outreach campaigns, leads, analytics. Unlike the
// managed-OAuth toolkits, Instantly is API_KEY auth: the user pastes their own
// Instantly v2 API key on Composio's hosted connect page (Composio stores it).
export const COMPOSIO_INSTANTLY_TOOLS: ComposioTool[] = [
  { slug: 'INSTANTLY_LIST_CAMPAIGNS', description: "List the user's Instantly outreach campaigns." },
  { slug: 'INSTANTLY_GET_CAMPAIGN', description: 'Get one Instantly campaign by id (settings, status).' },
  { slug: 'INSTANTLY_CREATE_CAMPAIGN', description: 'Create a new Instantly outreach campaign.' },
  { slug: 'INSTANTLY_GET_CAMPAIGN_ANALYTICS', description: 'Get analytics for a campaign (sent, opens, replies, bounces).' },
  { slug: 'INSTANTLY_LIST_LEADS', description: 'List leads, optionally filtered by campaign or lead list.' },
  { slug: 'INSTANTLY_CREATE_LEAD', description: 'Add a lead (email, name, company, custom vars) to a campaign/list.' },
  { slug: 'INSTANTLY_UPDATE_LEAD', description: 'Update an existing Instantly lead.' },
  { slug: 'INSTANTLY_UPDATE_LEAD_INTEREST_STATUS', description: "Set a lead's interest status (e.g. interested, not interested, meeting booked)." },
  { slug: 'INSTANTLY_LIST_LEAD_LISTS', description: "List the user's Instantly lead lists." },
  { slug: 'INSTANTLY_LIST_ACCOUNTS', description: 'List the connected sending email accounts.' },
];

// Curated X (Twitter) tools. OAuth2 via OUR OWN X app (BYO OAuth; no managed
// auth, no API key). Kept tight + cost-aware: X API is pay-per-use, so we
// deliberately EXCLUDE the expensive full-archive search, DMs (need extra
// scopes), lists and spaces. Each user still connects their OWN X account.
export const COMPOSIO_TWITTER_TOOLS: ComposioTool[] = [
  { slug: 'TWITTER_CREATION_OF_A_POST', description: 'Post a tweet from the connected X account.' },
  { slug: 'TWITTER_POST_DELETE_BY_POST_ID', description: "Delete one of the connected account's own posts." },
  { slug: 'TWITTER_RECENT_SEARCH', description: 'Search posts from the last 7 days by query.' },
  { slug: 'TWITTER_POST_LOOKUP_BY_POST_ID', description: 'Read a specific post by its id.' },
  { slug: 'TWITTER_USER_LOOKUP_ME', description: "Look up the connected account's own X profile." },
  { slug: 'TWITTER_USER_LOOKUP_BY_USERNAME', description: 'Look up an X user by @username.' },
  { slug: 'TWITTER_FOLLOW_USER', description: 'Follow an X user.' },
  { slug: 'TWITTER_USER_LIKE_POST', description: 'Like a post.' },
  { slug: 'TWITTER_RETWEET_POST', description: 'Repost (retweet) a post.' },
  // Direct messages (needs the X app's "Read and write and Direct Messages"
  // permission + the dm.read/dm.write scopes granted on connect).
  { slug: 'TWITTER_SEND_A_NEW_MESSAGE_TO_A_USER', description: 'Send a direct message to an X user.' },
  { slug: 'TWITTER_CREATE_A_NEW_DM_CONVERSATION', description: 'Start a new DM conversation.' },
  { slug: 'TWITTER_SEND_A_NEW_MESSAGE_TO_A_DM_CONVERSATION', description: 'Send a message in an existing DM conversation.' },
  { slug: 'TWITTER_GET_RECENT_DM_EVENTS', description: 'Read recent direct-message events (the DM inbox).' },
  { slug: 'TWITTER_GET_DM_EVENTS_FOR_A_DM_CONVERSATION', description: 'Read messages in a specific DM conversation.' },
];

// Curated Apollo tools. API_KEY auth (user pastes their own Apollo key on
// Composio's hosted connect page, Composio stores it) — same model as Instantly,
// runs on the user's own Apollo account. Sales-intelligence + lightweight CRM.
export const COMPOSIO_APOLLO_TOOLS: ComposioTool[] = [
  { slug: 'APOLLO_PEOPLE_SEARCH', description: "Search Apollo's database for people (leads) by title, company, location, etc." },
  { slug: 'APOLLO_ORGANIZATION_SEARCH', description: 'Search Apollo for organizations/companies.' },
  { slug: 'APOLLO_PEOPLE_ENRICHMENT', description: 'Enrich a person (email, title, company, socials) from Apollo.' },
  { slug: 'APOLLO_ORGANIZATION_ENRICHMENT', description: 'Enrich a company with Apollo firmographic data.' },
  { slug: 'APOLLO_SEARCH_CONTACTS', description: "Search the user's own Apollo contacts." },
  { slug: 'APOLLO_CREATE_CONTACT', description: 'Create an Apollo contact.' },
  { slug: 'APOLLO_UPDATE_CONTACT', description: 'Update an existing Apollo contact.' },
  { slug: 'APOLLO_SEARCH_ACCOUNTS', description: "Search the user's Apollo accounts." },
  { slug: 'APOLLO_CREATE_DEAL', description: 'Create an Apollo deal.' },
  { slug: 'APOLLO_LIST_DEALS', description: 'List Apollo deals.' },
  { slug: 'APOLLO_CREATE_TASK', description: 'Create an Apollo task.' },
  { slug: 'APOLLO_ADD_CONTACTS_TO_SEQUENCE', description: 'Add contacts to an Apollo outreach sequence.' },
];

// Curated Attio tools — the user's existing CRM. Read + safe writes; the two
// destructive deletes (ATTIO_DELETE_RECORD / ATTIO_DELETE_NOTE) are held back.
// Managed OAuth, so no Attio dev app on our side.
export const COMPOSIO_ATTIO_TOOLS: ComposioTool[] = [
  { slug: 'ATTIO_LIST_OBJECTS', description: "List the workspace's objects (people, companies, deals, custom objects)." },
  { slug: 'ATTIO_GET_OBJECT', description: 'Get one object and its attributes by id or slug.' },
  { slug: 'ATTIO_LIST_RECORDS', description: 'List records for an object, with optional filters and sorting.' },
  { slug: 'ATTIO_FIND_RECORD', description: 'Find a specific record (e.g. a person or company) in an object.' },
  { slug: 'ATTIO_LIST_LISTS', description: "List the workspace's lists." },
  { slug: 'ATTIO_LIST_NOTES', description: 'List notes, optionally for a given record.' },
  { slug: 'ATTIO_CREATE_RECORD', description: 'Create a record (person, company, deal, custom object entry).' },
  { slug: 'ATTIO_UPDATE_RECORD', description: "Update an existing record's attributes." },
  { slug: 'ATTIO_CREATE_NOTE', description: 'Add a note to a record.' },
];

// HubSpot via Composio agent tools (managed OAuth). Replaces the old sync-button
// import: the copilot reads/writes HubSpot on demand, like the other toolkits.
export const COMPOSIO_HUBSPOT_TOOLS: ComposioTool[] = [
  { slug: 'HUBSPOT_HUBSPOT_LIST_CONTACTS', description: 'List HubSpot contacts.' },
  { slug: 'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA', description: 'Search HubSpot contacts by criteria.' },
  { slug: 'HUBSPOT_CREATE_CONTACT', description: 'Create a HubSpot contact.' },
  { slug: 'HUBSPOT_HUBSPOT_UPDATE_CONTACT', description: "Update a HubSpot contact's properties." },
  { slug: 'HUBSPOT_HUBSPOT_LIST_COMPANIES', description: 'List HubSpot companies.' },
  { slug: 'HUBSPOT_CREATE_COMPANY', description: 'Create a HubSpot company.' },
  { slug: 'HUBSPOT_HUBSPOT_LIST_DEALS', description: 'List HubSpot deals.' },
  { slug: 'HUBSPOT_CREATE_DEAL', description: 'Create a HubSpot deal.' },
];

// Salesforce via Composio agent tools (managed OAuth). SOQL covers flexible reads.
export const COMPOSIO_SALESFORCE_TOOLS: ComposioTool[] = [
  { slug: 'SALESFORCE_EXECUTE_SOQL_QUERY', description: 'Run a SOQL query to read any Salesforce records.' },
  { slug: 'SALESFORCE_LIST_ACCOUNTS', description: 'List Salesforce accounts.' },
  { slug: 'SALESFORCE_GET_ACCOUNT', description: 'Get a Salesforce account by id.' },
  { slug: 'SALESFORCE_CREATE_ACCOUNT', description: 'Create a Salesforce account.' },
  { slug: 'SALESFORCE_GET_CONTACT', description: 'Get a Salesforce contact by id.' },
  { slug: 'SALESFORCE_CREATE_CONTACT', description: 'Create a Salesforce contact.' },
  { slug: 'SALESFORCE_CREATE_LEAD', description: 'Create a Salesforce lead.' },
  { slug: 'SALESFORCE_CREATE_OPPORTUNITY', description: 'Create a Salesforce opportunity.' },
  { slug: 'SALESFORCE_GET_OPPORTUNITY', description: 'Get a Salesforce opportunity by id.' },
];

// Firecrawl via Composio — web scrape/search/extract exposed to the copilot.
// API_KEY auth, used ORG-WIDE under our own key (see the registry entry below).
export const COMPOSIO_FIRECRAWL_TOOLS: ComposioTool[] = [
  {
    slug: 'FIRECRAWL_SCRAPE',
    description:
      'Scrape a single web page and return clean, LLM-ready content (markdown). Use to read a specific URL (a company site, a person/LinkedIn page, an article). Requires `url`.',
  },
  {
    slug: 'FIRECRAWL_SEARCH',
    description:
      'Web search that returns results with scraped page content. Use to research a company or person, or to find pages when you do not already have the URL. Requires `query`.',
  },
  {
    slug: 'FIRECRAWL_EXTRACT',
    description:
      'Extract structured data from one or more web pages given a prompt/schema. Use when you need specific fields (e.g. pricing, team, contact details) rather than the full page text.',
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
        // Desync: HubSpot is now an agent toolkit (was a sync-button import).
        slug: 'hubspot',
        label: 'HubSpot',
        authConfigId:
          process.env.COMPOSIO_HUBSPOT_AUTH_CONFIG_ID ?? 'ac_6AZ59Pryo_jX',
        tools: COMPOSIO_HUBSPOT_TOOLS,
      },
      {
        // Desync: Salesforce is now an agent toolkit (was a sync-button import).
        slug: 'salesforce',
        label: 'Salesforce',
        authConfigId:
          process.env.COMPOSIO_SALESFORCE_AUTH_CONFIG_ID ?? 'ac_YsLbeco-Kx7F',
        tools: COMPOSIO_SALESFORCE_TOOLS,
      },
      {
        slug: 'airtable',
        label: 'Airtable',
        authConfigId: process.env.COMPOSIO_AIRTABLE_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_AIRTABLE_TOOLS,
      },
      {
        slug: 'gmail',
        label: 'Gmail',
        authConfigId: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_GMAIL_TOOLS,
      },
      {
        slug: 'outlook',
        label: 'Outlook',
        authConfigId: process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_OUTLOOK_TOOLS,
      },
      {
        slug: 'googlecalendar',
        label: 'Google Calendar',
        authConfigId: process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_GOOGLECALENDAR_TOOLS,
      },
      {
        slug: 'notion',
        label: 'Notion',
        authConfigId: process.env.COMPOSIO_NOTION_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_NOTION_TOOLS,
      },
      {
        slug: 'calendly',
        label: 'Calendly',
        authConfigId: process.env.COMPOSIO_CALENDLY_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_CALENDLY_TOOLS,
      },
      {
        slug: 'microsoft_teams',
        label: 'Microsoft Teams',
        authConfigId: process.env.COMPOSIO_MICROSOFT_TEAMS_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_MICROSOFT_TEAMS_TOOLS,
      },
      {
        slug: 'googledrive',
        label: 'Google Drive',
        authConfigId: process.env.COMPOSIO_GOOGLEDRIVE_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_GOOGLEDRIVE_TOOLS,
      },
      {
        slug: 'googlesheets',
        label: 'Google Sheets',
        authConfigId: process.env.COMPOSIO_GOOGLESHEETS_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_GOOGLESHEETS_TOOLS,
      },
      {
        // Instantly uses API_KEY auth (the user pastes their own key on
        // Composio's hosted connect page); otherwise identical to the REST
        // toolkits — enabled only when its auth-config id is set.
        slug: 'instantly',
        label: 'Instantly',
        authConfigId: process.env.COMPOSIO_INSTANTLY_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_INSTANTLY_TOOLS,
      },
      {
        slug: 'attio',
        label: 'Attio',
        authConfigId: process.env.COMPOSIO_ATTIO_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_ATTIO_TOOLS,
      },
      {
        // X (Twitter): OAuth2 via OUR OWN X app (BYO OAuth, no managed/API-key).
        // Enabled only when its auth-config id is set. Pay-per-use API, so the
        // curated tool set is deliberately tight (no full-archive search/DMs).
        slug: 'twitter',
        label: 'X (Twitter)',
        authConfigId: process.env.COMPOSIO_TWITTER_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_TWITTER_TOOLS,
      },
      {
        // Apollo: API_KEY auth (user brings their own Apollo key, like Instantly).
        slug: 'apollo',
        label: 'Apollo',
        authConfigId: process.env.COMPOSIO_APOLLO_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_APOLLO_TOOLS,
      },
      {
        // Granola is an MCP toolkit: tools come from its MCP server, not REST.
        slug: 'granola_mcp',
        label: 'Granola',
        authConfigId: process.env.COMPOSIO_GRANOLA_MCP_AUTH_CONFIG_ID ?? '',
        tools: [],
        mcpServerUrl: process.env.COMPOSIO_GRANOLA_MCP_SERVER_URL ?? '',
      },
      {
        // Firecrawl: web scrape/search/extract for the copilot. ORG-WIDE — backed
        // by OUR single Firecrawl key (API_KEY auth), not a per-user connection,
        // so it's available to everyone, executed under a shared service user id,
        // and intentionally has NO "connect your account" card. Enabled once its
        // auth config id is set (same gate as every other toolkit).
        slug: 'firecrawl',
        label: 'Firecrawl',
        authConfigId: process.env.COMPOSIO_FIRECRAWL_AUTH_CONFIG_ID ?? '',
        tools: COMPOSIO_FIRECRAWL_TOOLS,
        orgWide: true,
        serviceUserId:
          process.env.COMPOSIO_FIRECRAWL_SERVICE_USER_ID ??
          'desync-firecrawl-service',
      },
    ];
    const map: Record<string, ComposioToolkit> = {};

    for (const def of defs) {
      // Every toolkit needs an auth config to connect; an MCP toolkit also needs
      // its server URL to list/run tools — without it, leave the toolkit off.
      const isMcp = def.mcpServerUrl !== undefined;
      const enabled =
        Boolean(def.authConfigId) && (!isMcp || Boolean(def.mcpServerUrl));

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
  // Coalesces concurrent status lookups for the same user — every integration
  // card asks at once on page load / right after an OAuth redirect — into one
  // upstream call, so the burst can't stampede or rate-limit Composio.
  private readonly inflightConnected = new Map<string, Promise<Set<string>>>();

  get isConfigured(): boolean {
    return Boolean(this.apiKey) && Object.keys(this.toolkits).length > 0;
  }

  isToolkitEnabled(toolkitSlug: string): boolean {
    return Boolean(this.apiKey) && toolkitSlug in this.toolkits;
  }

  get enabledToolkits(): ComposioToolkit[] {
    return Object.values(this.toolkits);
  }

  // True when any enabled toolkit is org-wide (backed by our shared key), so the
  // copilot tool provider can offer it even to users who've connected nothing.
  get hasOrgWideToolkits(): boolean {
    return this.enabledToolkits.some((toolkit) => toolkit.orgWide === true);
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
    returnUrl?: string,
  ): Promise<ComposioConnectResult> {
    const toolkit = this.toolkits[toolkitSlug];

    if (!this.apiKey || !toolkit) {
      throw new Error(`Composio toolkit not configured: ${toolkitSlug}`);
    }
    // Return the user to the page they started from (on their own workspace
    // subdomain) after OAuth, instead of the hardcoded base integrations page
    // (which drops the workspace session -> a "choose a workspace" re-prompt).
    const callback = returnUrl ?? this.callbackUrl;
    const res = await this.request<{
      redirectUrl?: string;
      redirect_url?: string;
    }>('POST', '/connected_accounts/link', {
      auth_config_id: toolkit.authConfigId,
      user_id: userId,
      ...(callback ? { callback_url: callback } : {}),
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

    // Share one in-flight request across all concurrent callers.
    const existing = this.inflightConnected.get(userId);

    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        const res = await this.request<{ items?: ConnectedAccount[] }>(
          'GET',
          `/connected_accounts?user_ids=${encodeURIComponent(userId)}`,
        );
        const enabled = new Set(Object.keys(this.toolkits));
        const slugs = new Set(
          (res.items ?? [])
            .filter(
              (account) =>
                account.status === 'ACTIVE' &&
                account.toolkit?.slug !== undefined &&
                enabled.has(account.toolkit.slug),
            )
            .map((account) => account.toolkit!.slug as string),
        );

        // Cache only a successful lookup, so a transient failure can't stick a
        // user as "disconnected" for the whole TTL (the bug behind every card
        // flashing "Connect" after an OAuth redirect).
        this.statusCache.set(userId, { slugs, at: Date.now() });

        return slugs;
      } catch (error) {
        this.logger.warn(
          `Composio status check failed: ${(error as Error).message}`,
        );

        return new Set<string>();
      } finally {
        this.inflightConnected.delete(userId);
      }
    })();

    this.inflightConnected.set(userId, promise);

    return promise;
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
    const slugs = new Set<string>(connected);
    // Org-wide toolkits (e.g. Firecrawl) are backed by OUR shared key rather than
    // a per-user connection, so expose their tools to every user.
    for (const toolkit of this.enabledToolkits) {
      if (toolkit.orgWide) {
        slugs.add(toolkit.slug);
      }
    }
    const out: ComposioTool[] = [];

    for (const slug of slugs) {
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

    // Org-wide toolkits (e.g. Firecrawl) run under OUR shared service account, so
    // the call isn't scoped to the end user's own connections.
    const orgWideToolkit = this.orgWideToolkitForSlug(toolSlug);
    const effectiveUserId = orgWideToolkit
      ? this.orgWideServiceUserId(orgWideToolkit)
      : userId;

    try {
      const res = await this.request<{
        data?: unknown;
        error?: unknown;
        successful?: boolean;
      }>('POST', `/tools/execute/${encodeURIComponent(toolSlug)}`, {
        user_id: effectiveUserId,
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

  // Org-wide toolkit (e.g. Firecrawl) this slug belongs to — matched by the
  // `TOOLKIT_` slug prefix, the same convention as the MCP matcher above.
  private orgWideToolkitForSlug(toolSlug: string): ComposioToolkit | undefined {
    return this.enabledToolkits.find(
      (toolkit) =>
        Boolean(toolkit.orgWide) &&
        toolSlug.startsWith(`${toolkit.slug.toUpperCase()}_`),
    );
  }

  // The shared Composio user id that holds our org-wide connection for a toolkit
  // (the Firecrawl connected account is created once under this id with our key).
  private orgWideServiceUserId(toolkit: ComposioToolkit): string {
    return toolkit.serviceUserId || 'desync-service';
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
