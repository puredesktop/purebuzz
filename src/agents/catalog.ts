/**
 * Exposed PureBuzz operations (must stay in sync 1:1 with `plugin.json` -> `app.agents.tools[].name`).
 *
 * 3-tier exposure (built on `@purescience/platform-ui/bridge/appFunctions`):
 *   1. 4 composite `function` workflows (`fn_*`) — replace multi-step read/search/dossier round-trips
 *   2. 5 core atomic tools — 2 core read verbs (`getBuzzContext`, `readMessages`) + all 3 mandatory
 *      release actions (`sendMessage`, `sendDirectMessage`, `sendMediaFile`)
 *   3. 3 universal escape-hatch meta-tools (`discoverAppTools`, `callExtendedReadTool`, `callExtendedTool`)
 *      providing full on-demand access to the remaining 5 specialist atomic tools.
 */
export const PUREBUZZ_FUNCTION_NAMES = [
  'fn_catchUpBriefing',
  'fn_channelSnapshot',
  'fn_personActivityDossier',
  'fn_searchBuzzTopics',
] as const

export const PUREBUZZ_CORE_TOOL_NAMES = [
  'getBuzzContext',
  'readMessages',
  'sendMessage',
  'sendDirectMessage',
  'sendMediaFile',
] as const

export const PUREBUZZ_META_TOOL_NAMES = [
  'discoverAppTools',
  'callExtendedReadTool',
  'callExtendedTool',
] as const

export const EXPOSED_TOOL_NAMES = [
  ...PUREBUZZ_FUNCTION_NAMES,
  ...PUREBUZZ_CORE_TOOL_NAMES,
  ...PUREBUZZ_META_TOOL_NAMES,
] as const

/** Keep in sync with `plugin.json` -> `app.agents.tools[].name`. */
export const PUREBUZZ_AGENT_TOOL_NAMES = EXPOSED_TOOL_NAMES

export const PUREBUZZ_EXTENDED_TOOL_NAMES = [
  'listChannels',
  'searchMessages',
  'listMembers',
  'latestMessages',
  'listMedia',
] as const

export const PUREBUZZ_ALL_ATOMIC_TOOL_NAMES = [
  ...PUREBUZZ_CORE_TOOL_NAMES,
  ...PUREBUZZ_EXTENDED_TOOL_NAMES,
] as const

export const PUREBUZZ_AGENT_LOG_LABEL = 'purebuzz'
