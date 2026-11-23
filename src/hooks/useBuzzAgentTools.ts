import { useMemo, useRef } from 'react'
import {
  usePlatformAgentTools,
  type AgentToolHandler,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { readPlatformFileBinary } from '@purescience/platform-ui/bridge/fs'
import {
  AgentBuzzToolError,
  EXPOSED_TOOL_NAMES,
  PUREBUZZ_AGENT_LOG_LABEL,
  type BuzzAgentToolContext,
} from '../agents/buzzAgentTools'
import { buildPureBuzzHandlers } from '../agents/operationsRegistry'
import type { BuzzChatState } from './useBuzzChat'

/**
 * Registers PureBuzz's exposed agent operations (composite `fn_*` functions,
 * core/release atomic tools, and universal escape-hatch meta-tools) with the
 * shell. Without this the tools declared in plugin.json are shown to the model
 * but every call times out — the platform routes the invoke to the app tab and
 * waits for a handler.
 */
export function useBuzzAgentTools(chat: BuzzChatState): void {
  // Handlers close over a ref so a tool invoked mid-render (or polled during
  // async DM opening) always sees the latest live chat state.
  const chatRef = useRef(chat)
  chatRef.current = chat

  const toolContextRef = useRef<BuzzAgentToolContext>({
    getChat: () => chatRef.current,
    readFile: readPlatformFileBinary,
  })

  const registryHandlersRef = useRef<Record<string, AgentToolHandler> | null>(
    null,
  )
  if (!registryHandlersRef.current) {
    registryHandlersRef.current = buildPureBuzzHandlers(
      () => toolContextRef.current,
    )
  }

  // Statically keyed over EXPOSED_TOOL_NAMES so scripts/check-manifests.mjs
  // verifies every exposed manifest tool has a registered handler.
  const exposedHandlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) =>
            registryHandlersRef.current![name]!(invoke),
        ]),
      ),
    [],
  )

  usePlatformAgentTools({
    ready: chat.status === 'ready',
    tools: EXPOSED_TOOL_NAMES,
    logLabel: PUREBUZZ_AGENT_LOG_LABEL,
    errorType: AgentBuzzToolError,
    handlers: exposedHandlers,
  })
}
