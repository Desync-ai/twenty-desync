import { COMMON_PRELOAD_TOOLS } from 'src/engine/core-modules/tool-provider/constants/common-preload-tools.const';

export const AI_CHAT_TOOL_NAMES_TO_PRELOAD: string[] = [
  ...COMMON_PRELOAD_TOOLS,
  'app_exa_web_search',
  // Desync: preload the highest-frequency "create" CRUD tools so trivial asks
  // ("add a person/company/note/task") skip the learn_tools/execute_tool hop.
  // Deliberately NOT preloading find_many_* here: their filter schemas (every
  // field x every operator + orderBy) are the largest in the catalog and would
  // bloat every request's tool payload. Check PostHog $ai_input_tokens before
  // widening this list.
  'create_one_person',
  'create_one_company',
  'create_one_note',
  'create_one_task',
];
