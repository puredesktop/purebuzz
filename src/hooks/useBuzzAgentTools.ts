import { useRef } from 'react'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { readPlatformFileBinary } from '@purescience/platform-ui/bridge/fs'
import {
  AgentBuzzToolError,
  latestMessagesHandler,
  listMediaHandler,
  sendMediaFileHandler,
  PUREBUZZ_AGENT_LOG_LABEL,
  PUREBUZZ_AGENT_TOOL_NAMES,
  getBuzzContextHandler,
  listChannelsHandler,
  listMembersHandler,
  readMessagesHandler,
  searchMessagesHandler,
  sendDirectMessageHandler,
  sendMessageHandler,
} from '../agents/buzzAgentTools'
import type { BuzzChatState } from './useBuzzChat'

/**
 * Registers PureBuzz's agent tools with the shell. Without this the tools
 * declared in plugin.json are shown to the model but every call times out —
 * the platform routes the invoke to the app tab and waits for a handler.
 */
export function useBuzzAgentTools(chat: BuzzChatState): void {
  // Handlers close over a ref so a tool invoked mid-render always sees the
  // current chat state rather than the values from registration time.
  const chatRef = useRef(chat)
  chatRef.current = chat

  usePlatformAgentTools({
    ready: chat.status === 'ready',
    tools: PUREBUZZ_AGENT_TOOL_NAMES,
    logLabel: PUREBUZZ_AGENT_LOG_LABEL,
    errorType: AgentBuzzToolError,
    handlers: {
      getBuzzContext: async () => ({
        content: getBuzzContextHandler(chatRef.current),
      }),
      listChannels: async () => ({
        content: listChannelsHandler(chatRef.current),
      }),
      readMessages: async invoke => ({
        content: await readMessagesHandler(chatRef.current, invoke.arguments),
      }),
      searchMessages: async invoke => ({
        content: await searchMessagesHandler(
          chatRef.current,
          invoke.arguments,
        ),
      }),
      listMembers: async invoke => ({
        content: listMembersHandler(chatRef.current, invoke.arguments),
      }),
      sendMessage: async invoke => ({
        content: await sendMessageHandler(chatRef.current, invoke.arguments),
      }),
      // Opening a DM is asynchronous relay work — the handler polls fresh
      // state, so it gets the ref itself rather than a snapshot.
      sendDirectMessage: async invoke => ({
        content: await sendDirectMessageHandler(
          () => chatRef.current,
          invoke.arguments,
        ),
      }),
      latestMessages: async invoke => ({
        content: await latestMessagesHandler(
          chatRef.current,
          invoke.arguments,
        ),
      }),
      listMedia: async invoke => ({
        content: await listMediaHandler(chatRef.current, invoke.arguments),
      }),
      sendMediaFile: async invoke => ({
        content: await sendMediaFileHandler(
          chatRef.current,
          invoke.arguments,
          readPlatformFileBinary,
        ),
      }),
    },
  })
}
