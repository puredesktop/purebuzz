import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type {
  AgentToolHandler,
  AgentToolHandlerResult,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PUREBUZZ_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  AgentBuzzToolError,
  getBuzzContextHandler,
  latestMessagesHandler,
  listChannelsHandler,
  listMediaHandler,
  listMembersHandler,
  readMessagesHandler,
  searchMessagesHandler,
  sendDirectMessageHandler,
  sendMediaFileHandler,
  sendMessageHandler,
  type BuzzAgentToolContext,
} from './buzzAgentTools'
import { PUREBUZZ_FUNCTIONS } from './functions'

type AtomicRunner = (
  ctx: BuzzAgentToolContext,
  args: Record<string, unknown>,
) => Promise<AgentToolHandlerResult>

const ATOMIC_RUNNERS: Record<string, AtomicRunner> = {
  getBuzzContext: async ctx => ({
    content: getBuzzContextHandler(ctx.getChat()),
  }),
  listChannels: async ctx => ({
    content: listChannelsHandler(ctx.getChat()),
  }),
  readMessages: async (ctx, args) => ({
    content: await readMessagesHandler(ctx.getChat(), args),
  }),
  searchMessages: async (ctx, args) => ({
    content: await searchMessagesHandler(ctx.getChat(), args),
  }),
  listMembers: async (ctx, args) => ({
    content: listMembersHandler(ctx.getChat(), args),
  }),
  sendMessage: async (ctx, args) => ({
    content: await sendMessageHandler(ctx.getChat(), args),
  }),
  // Opening a DM is asynchronous relay work — pass ctx.getChat so polling
  // always reads live state rather than a stale snapshot.
  sendDirectMessage: async (ctx, args) => ({
    content: await sendDirectMessageHandler(ctx.getChat, args),
  }),
  latestMessages: async (ctx, args) => ({
    content: await latestMessagesHandler(ctx.getChat(), args),
  }),
  listMedia: async (ctx, args) => ({
    content: await listMediaHandler(ctx.getChat(), args),
  }),
  sendMediaFile: async (ctx, args) => ({
    content: await sendMediaFileHandler(ctx.getChat(), args, ctx.readFile),
  }),
}

const atomicTools: AppAtomicToolDefinition<BuzzAgentToolContext>[] =
  PUREBUZZ_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<BuzzAgentToolContext>({
      ...schema,
      run: async (ctx, args) => {
        const runner = ATOMIC_RUNNERS[schema.name]
        if (!runner) {
          throw new AgentBuzzToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, args)
      },
    }),
  )

/**
 * PureBuzz's unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 4 composite `function` workflows (`fn_*`, always exposed)
 *   - 5 core atomic tools (2 core read verbs + all 3 mandatory release tools, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 5 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PUREBUZZ_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<BuzzAgentToolContext>({
    appSlug: 'buzz',
    appName: 'Buzz',
    functions: PUREBUZZ_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureBuzzHandlers(
  getCtx: () => BuzzAgentToolContext,
  options: BuildHandlersOptions<BuzzAgentToolContext> = {},
): Record<string, AgentToolHandler> {
  return PUREBUZZ_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new AgentBuzzToolError(message),
    ...options,
  })
}
