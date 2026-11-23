import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { BuzzChatState } from '../hooks/useBuzzChat'
import type { BuzzMessage } from '../lib/buzzProtocol'
import { PUREBUZZ_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  AgentBuzzToolError,
  type BuzzAgentToolContext,
} from './buzzAgentTools'
import {
  EXPOSED_TOOL_NAMES,
  PUREBUZZ_AGENT_TOOL_NAMES,
  PUREBUZZ_ALL_ATOMIC_TOOL_NAMES,
  PUREBUZZ_CORE_TOOL_NAMES,
  PUREBUZZ_EXTENDED_TOOL_NAMES,
  PUREBUZZ_FUNCTION_NAMES,
  PUREBUZZ_META_TOOL_NAMES,
} from './catalog'
import {
  PUREBUZZ_OPERATIONS_REGISTRY,
  buildPureBuzzHandlers,
} from './operationsRegistry'

const ME = 'a'.repeat(64)
const ADA = 'b'.repeat(64)
const BOB = 'c'.repeat(64)

const RELEASE_VERBS = new Set([
  'send',
  'sends',
  'sending',
  'merge',
  'merges',
  'merging',
  'publish',
  'publishes',
  'publishing',
  'deposit',
  'deposits',
  'depositing',
  'deploy',
  'deploys',
  'deploying',
  'post',
  'posts',
  'posting',
])

function makeMsg(
  overrides: Partial<BuzzMessage> & { id: string; channelId: string; text: string },
): BuzzMessage {
  return {
    pubkey: ADA,
    createdAt: 1_700_000_000,
    media: [],
    parentId: null,
    rootId: null,
    mentions: [],
    ...overrides,
  }
}

function fakeChat(overrides: Partial<BuzzChatState> = {}): BuzzChatState {
  const activeMessages: BuzzMessage[] = [
    makeMsg({
      id: 'm1',
      channelId: 'chan-general',
      pubkey: ADA,
      createdAt: 1_700_000_000,
      text: 'Hello @adam, launch checklist is up.',
      mentions: [ME],
      media: [{ url: 'https://relay.example/media/launch.png', mime: 'image/png' }],
    }),
    makeMsg({
      id: 'm2',
      channelId: 'chan-general',
      pubkey: ME,
      createdAt: 1_700_000_100,
      text: 'orig typo',
      parentId: 'm1',
    }),
    makeMsg({
      id: 'm3',
      channelId: 'chan-general',
      pubkey: BOB,
      createdAt: 1_700_000_150,
      text: 'deleted message',
    }),
  ]

  const designMessages: BuzzMessage[] = [
    makeMsg({
      id: 'd1',
      channelId: 'chan-design',
      pubkey: BOB,
      createdAt: 1_700_000_300,
      text: 'Updated brand assets for launch.',
      media: [{ url: 'https://relay.example/media/brand.pdf', mime: 'application/pdf' }],
    }),
  ]

  const dmMessages: BuzzMessage[] = [
    makeMsg({
      id: 'dm-m1',
      channelId: 'dm-ada',
      pubkey: ADA,
      createdAt: 1_700_000_400,
      text: 'Hey adam, can you check the release notes?',
    }),
  ]

  const names: Record<string, string> = {
    [ME]: 'adam',
    [ADA]: 'ada',
    [BOB]: 'bob',
  }

  return {
    status: 'ready',
    noIdentity: false,
    recent: [],
    keyStorage: { kind: 'stored' },
    statusDetail: null,
    relayUrl: 'wss://relay.example',
    publicKey: ME,
    displayName: 'adam',
    nameFor: (pubkey: string) => names[pubkey] ?? pubkey.slice(0, 8),
    names,
    emails: { [ADA]: 'ada@example.org', [BOB]: 'bob@example.org' },
    setDisplayName: async () => null,
    channels: [
      {
        id: 'chan-general',
        name: 'general',
        about: 'Main team channel',
        visibility: 'open',
        type: 'channel',
        participants: [],
      },
      {
        id: 'chan-design',
        name: 'design',
        about: 'Design reviews',
        visibility: 'private',
        type: 'channel',
        participants: [],
      },
      {
        id: 'chan-noisy',
        name: 'alerts',
        about: 'Automated alerts',
        visibility: 'open',
        type: 'channel',
        participants: [],
      },
      {
        id: 'dm-ada',
        name: 'dm',
        about: null,
        visibility: 'private',
        type: 'dm',
        participants: [ME, ADA],
      },
    ],
    activeChannelId: 'chan-general',
    messages: activeMessages,
    hasOlder: false,
    loadOlder: async () => undefined,
    searchMessages: async () => [],
    fetchMessages: async channelId => {
      if (channelId === 'chan-design') return designMessages
      if (channelId === 'dm-ada') return dmMessages
      return []
    },
    fetchLatest: async opts => {
      const pool = [...dmMessages, ...designMessages, ...activeMessages].sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      return pool
        .filter(m => !opts.channelId || m.channelId === opts.channelId)
        .filter(m => !opts.authorHex || m.pubkey === opts.authorHex)
        .slice(0, opts.limit)
    },
    searchIn: async (channelId, query) => {
      const q = query.toLowerCase()
      const map: Record<string, BuzzMessage[]> = {
        'chan-general': activeMessages,
        'chan-design': designMessages,
        'dm-ada': dmMessages,
      }
      return (map[channelId] ?? []).filter(m =>
        m.text.toLowerCase().includes(q),
      )
    },
    searchAll: async query => {
      const q = query.toLowerCase()
      return [...dmMessages, ...designMessages, ...activeMessages]
        .filter(m => m.text.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    sendTo: async () => null,
    channelMembers: {
      'chan-general': [
        { pubkey: ME, role: 'owner' },
        { pubkey: ADA, role: 'admin' },
        { pubkey: BOB, role: 'member' },
      ],
      'chan-design': [
        { pubkey: ME, role: 'member' },
        { pubkey: BOB, role: 'owner' },
      ],
      'chan-noisy': [{ pubkey: ME, role: 'member' }],
    },
    presence: { [ME]: true, [ADA]: true, [BOB]: false },
    unread: { 'chan-design': 1, 'dm-ada': 3, 'chan-noisy': 9 },
    markRead: () => undefined,
    muted: new Set(['chan-noisy']),
    toggleMute: () => undefined,
    hiddenDms: new Set<string>(),
    hideDm: () => undefined,
    linkPreviews: 'channels',
    typers: {},
    reactions: {
      m1: { '🚀': [{ pubkey: ME, eventId: 'r1' }] },
    },
    edits: { m2: { text: 'looks great!', at: 1_700_000_200 } },
    deleted: { m3: true },
    notifyTyping: () => undefined,
    sendReaction: async () => null,
    sendEdit: async () => null,
    sendDelete: async () => null,
    selectChannel: () => undefined,
    sendMessage: async () => null,
    sendFile: async () => null,
    resolveMedia: async () => '',
    createChannel: async () => null,
    addToChannel: async () => null,
    renameChannel: async () => null,
    leaveChannel: async () => null,
    removeFromChannel: async () => null,
    deleteChannel: async () => null,
    makeChannelPrivate: async () => null,
    setRelayUrl: () => undefined,
    joinWithInvite: async () => null,
    createInvite: async () => ({ code: 'x', expiresAt: 0 }),
    openDm: async () => null,
    joinPrompts: [],
    resolveJoinPrompt: async () => null,
    exportIdentity: () => null,
    importIdentity: async () => null,
    ...overrides,
  }
}

function makeCtx(
  chat: BuzzChatState,
  readFile: BuzzAgentToolContext['readFile'] = async () => ({
    base64: 'aGVsbG8=',
    mimeType: 'image/png',
  }),
): BuzzAgentToolContext {
  return {
    getChat: () => chat,
    readFile,
  }
}

function invokeArgs(shortName: string, args: Record<string, unknown> = {}) {
  return {
    toolCallId: 'test-call',
    name: `buzz.${shortName}`,
    shortName,
    arguments: args,
  }
}

describe('PureBuzz operationsRegistry invariants & manifest sync', () => {
  it('matches catalog lists, audit summary, and plugin.json 1:1', () => {
    const manifest = JSON.parse(readFileSync('plugin.json', 'utf8')) as {
      app: {
        agents: {
          tools: Array<{
            name: string
            description: string
            risk: string
            requiresApproval: boolean
            releaseButton?: string
            inputSchema: Record<string, unknown>
          }>
        }
      }
    }

    const summary = PUREBUZZ_OPERATIONS_REGISTRY.auditSummary()
    expect(summary).toEqual({
      appSlug: 'buzz',
      functions: 4,
      coreTools: 5,
      extendedTools: 5,
      metaTools: 3,
      totalExposed: 12,
      totalAtomicTools: 10,
      totalRegistered: 14,
      schemaReductionPercent: -20,
    })

    expect(PUREBUZZ_OPERATIONS_REGISTRY.exposedToolNames).toEqual([
      ...EXPOSED_TOOL_NAMES,
    ])
    expect([...PUREBUZZ_AGENT_TOOL_NAMES]).toEqual([...EXPOSED_TOOL_NAMES])
    expect(
      PUREBUZZ_OPERATIONS_REGISTRY.functions.map(f => f.name),
    ).toEqual([...PUREBUZZ_FUNCTION_NAMES])
    expect(
      PUREBUZZ_OPERATIONS_REGISTRY.coreTools.map(t => t.name),
    ).toEqual([...PUREBUZZ_CORE_TOOL_NAMES])
    expect(PUREBUZZ_OPERATIONS_REGISTRY.extendedToolNames).toEqual([
      ...PUREBUZZ_EXTENDED_TOOL_NAMES,
    ])
    expect([...PUREBUZZ_ALL_ATOMIC_TOOL_NAMES].sort()).toEqual(
      PUREBUZZ_ATOMIC_TOOL_SCHEMAS.map(t => t.name).sort(),
    )
    expect(manifest.app.agents.tools).toEqual(
      PUREBUZZ_OPERATIONS_REGISTRY.manifestTools,
    )
    expect(PUREBUZZ_META_TOOL_NAMES).toEqual([
      'discoverAppTools',
      'callExtendedReadTool',
      'callExtendedTool',
    ])
  })

  it('satisfies manifest rules: descriptions >= 80 chars, explicit booleans, release tools always exposed, no release verbs on fn_*', () => {
    for (const tool of PUREBUZZ_OPERATIONS_REGISTRY.manifestTools) {
      const normalized = tool.description.trim().replace(/\s+/g, ' ')
      expect(
        normalized.length,
        `${tool.name} description too short (${normalized.length})`,
      ).toBeGreaterThanOrEqual(80)
      expect(typeof tool.requiresApproval).toBe('boolean')

      const nameFirst =
        tool.name
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      const descFirst =
        normalized
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''

      if (tool.risk !== 'release') {
        expect(
          RELEASE_VERBS.has(nameFirst),
          `${tool.name} starts with release verb`,
        ).toBe(false)
        expect(
          RELEASE_VERBS.has(descFirst),
          `${tool.name} description starts with release verb`,
        ).toBe(false)
      }
    }

    for (const fn of PUREBUZZ_OPERATIONS_REGISTRY.functions) {
      expect(fn.name.startsWith('fn_')).toBe(true)
      const afterPrefix =
        fn.name
          .slice(3)
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      expect(RELEASE_VERBS.has(afterPrefix)).toBe(false)
    }

    // All 10 atomic schemas maintain >= 80 char descriptions
    for (const atomic of PUREBUZZ_ATOMIC_TOOL_SCHEMAS) {
      expect(atomic.description.trim().replace(/\s+/g, ' ').length).toBeGreaterThanOrEqual(80)
      expect(typeof atomic.requiresApproval).toBe('boolean')
    }

    // Release tools must stay in coreTools (always exposed)
    for (const releaseName of ['sendMessage', 'sendDirectMessage', 'sendMediaFile']) {
      const entry = PUREBUZZ_OPERATIONS_REGISTRY.coreTools.find(
        t => t.name === releaseName,
      )
      expect(entry?.risk).toBe('release')
      expect(entry?.exposure).toBe('always')
      expect(entry?.releaseButton).toBe('Send')
    }

    // sendMediaFile satisfies context-first rule for its path argument
    const sendMedia = PUREBUZZ_OPERATIONS_REGISTRY.manifestTools.find(
      t => t.name === 'sendMediaFile',
    )
    expect(sendMedia?.description).toMatch(/call getBuzzContext first/i)
  })

  it('builds one handler per exposed tool and none for extended tools directly', () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    expect(Object.keys(handlers).sort()).toEqual([...EXPOSED_TOOL_NAMES].sort())
    for (const extendedName of PUREBUZZ_EXTENDED_TOOL_NAMES) {
      expect(handlers[extendedName]).toBeUndefined()
    }
  })
})

describe('PureBuzz composite App Functions (fn_*)', () => {
  it('fn_catchUpBriefing summarizes unread channels (skipping muted by default) with untrusted-content framing', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    const res = await handlers.fn_catchUpBriefing(
      invokeArgs('fn_catchUpBriefing', {}),
    )
    const envelope = JSON.parse(res.content)
    expect(envelope.ok).toBe(true)
    expect(envelope.opClass).toBe('function')
    expect(envelope.function).toBe('fn_catchUpBriefing')
    expect(envelope.data._note).toMatch(/UNTRUSTED/)
    expect(envelope.data.context.me.name).toBe('adam')
    expect(envelope.data.channels).toHaveLength(4)
    // Unread non-muted channels: dm-ada (3 unread) then chan-design (1 unread); chan-noisy is muted
    expect(
      envelope.data.briefings.map((b: { channel: { id: string } }) => b.channel.id),
    ).toEqual(['dm-ada', 'chan-design'])
    expect(envelope.data.briefings[0].channel.name).toBe('ada')
    expect(envelope.data.briefings[0].messages).toHaveLength(1)
  })

  it('fn_catchUpBriefing falls back to active channel when no unreads exist and applies active overlays + mentions', async () => {
    const chat = fakeChat({ unread: {} })
    const handlers = buildPureBuzzHandlers(() => makeCtx(chat))
    const res = await handlers.fn_catchUpBriefing(
      invokeArgs('fn_catchUpBriefing', {}),
    )
    const envelope = JSON.parse(res.content)
    expect(envelope.data.briefings).toHaveLength(1)
    expect(envelope.data.briefings[0].channel.id).toBe('chan-general')
    // m3 was deleted, m2 was edited, m1 mentioned ME
    expect(envelope.data.briefings[0].messageCount).toBe(2)
    expect(envelope.data.briefings[0].mentionsMeCount).toBe(1)
    expect(envelope.data.briefings[0].messages[1].text).toBe('looks great!')
    expect(envelope.data.briefings[0].messages[1].edited).toBe(true)
    expect(envelope.data.briefings[0].messages[0].reactions).toEqual([
      { emoji: '🚀', count: 1 },
    ])
  })

  it('fn_channelSnapshot resolves channel by name with #, includes roster presence, messages, overlays, and media', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    const res = await handlers.fn_channelSnapshot(
      invokeArgs('fn_channelSnapshot', { channel: '#general' }),
    )
    const envelope = JSON.parse(res.content)
    expect(envelope.ok).toBe(true)
    expect(envelope.data._note).toMatch(/UNTRUSTED/)
    expect(envelope.data.channel.id).toBe('chan-general')
    expect(envelope.data.channel.about).toBe('Main team channel')
    expect(envelope.data.roster.totalMembers).toBe(3)
    expect(envelope.data.roster.onlineCount).toBe(2)
    // Online members sorted first
    expect(envelope.data.roster.members.map((m: { name: string }) => m.name)).toEqual([
      'ada',
      'adam',
      'bob',
    ])
    expect(envelope.data.messages).toHaveLength(2)
    expect(envelope.data.media).toHaveLength(1)
    expect(envelope.data.media[0].mime).toBe('image/png')

    // Online-only filter and DM resolution by participant name
    const dmRes = await handlers.fn_channelSnapshot(
      invokeArgs('fn_channelSnapshot', {
        channel: 'ada',
        includeOfflineMembers: false,
      }),
    )
    const dmEnv = JSON.parse(dmRes.content)
    expect(dmEnv.data.channel.id).toBe('dm-ada')
    expect(dmEnv.data.messages[0].text).toContain('release notes')
  })

  it('fn_channelSnapshot throws AgentBuzzToolError for unknown channel name', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    await expect(
      handlers.fn_channelSnapshot(
        invokeArgs('fn_channelSnapshot', { channel: '#nonexistent' }),
      ),
    ).rejects.toBeInstanceOf(AgentBuzzToolError)
  })

  it('fn_personActivityDossier compiles identity, shared channels, DM context, recent posts, and media', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    const res = await handlers.fn_personActivityDossier(
      invokeArgs('fn_personActivityDossier', { person: 'ADA' }),
    )
    const envelope = JSON.parse(res.content)
    expect(envelope.ok).toBe(true)
    expect(envelope.data._note).toMatch(/UNTRUSTED/)
    expect(envelope.data.person.name).toBe('ada')
    expect(envelope.data.person.email).toBe('ada@example.org')
    expect(envelope.data.person.online).toBe(true)
    expect(
      envelope.data.sharedChannels.map((c: { id: string }) => c.id),
    ).toEqual(['chan-general', 'dm-ada'])
    expect(envelope.data.dm.exists).toBe(true)
    expect(envelope.data.dm.channelId).toBe('dm-ada')
    expect(envelope.data.dm.messages).toHaveLength(1)
    expect(envelope.data.recentMessages).toHaveLength(2)
    expect(envelope.data.media).toHaveLength(1)
    expect(envelope.data.media[0].url).toBe(
      'https://relay.example/media/launch.png',
    )
  })

  it('fn_searchBuzzTopics searches across all channels, filters by author, and groups results by channel', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    const allRes = await handlers.fn_searchBuzzTopics(
      invokeArgs('fn_searchBuzzTopics', { query: 'launch' }),
    )
    const allEnv = JSON.parse(allRes.content)
    expect(allEnv.ok).toBe(true)
    expect(allEnv.data._note).toMatch(/UNTRUSTED/)
    expect(allEnv.data.scope).toBe('all')
    expect(allEnv.data.totalMatches).toBe(2)
    expect(allEnv.data.byChannel).toHaveLength(2)
    // chan-design match (1_700_000_300) is newer than chan-general match (1_700_000_000)
    expect(allEnv.data.byChannel[0].channelId).toBe('chan-design')
    expect(allEnv.data.byChannel[1].channelId).toBe('chan-general')

    // Scoped channel + author filter
    const scopedRes = await handlers.fn_searchBuzzTopics(
      invokeArgs('fn_searchBuzzTopics', {
        query: 'launch',
        channels: ['#general', 'design'],
        from: 'bob',
      }),
    )
    const scopedEnv = JSON.parse(scopedRes.content)
    expect(scopedEnv.data.scope).toEqual(['chan-general', 'chan-design'])
    expect(scopedEnv.data.totalMatches).toBe(1)
    expect(scopedEnv.data.byChannel[0].channelId).toBe('chan-design')
    expect(scopedEnv.data.authorFilter).toBe('bob')
  })

  it('fn_searchBuzzTopics rejects empty query', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))
    await expect(
      handlers.fn_searchBuzzTopics(
        invokeArgs('fn_searchBuzzTopics', { query: '   ' }),
      ),
    ).rejects.toThrow(/query is required/)
  })
})

describe('PureBuzz core tools & escape-hatch routing/refusals', () => {
  it('executes direct core tools including live-polled sendDirectMessage and sendMediaFile', async () => {
    const sent: Array<[string, string]> = []
    let currentChat = fakeChat({
      channels: fakeChat().channels.filter(c => c.type !== 'dm'),
      openDm: async () => {
        setTimeout(() => {
          currentChat = fakeChat({
            sendTo: async (channelId, text) => {
              sent.push([channelId, text])
              return null
            },
          })
        }, 40)
        return null
      },
      sendFile: async (file, text, channelId) => {
        sent.push([channelId ?? '', `${file.name}:${text}`])
        return null
      },
    })

    const handlers = buildPureBuzzHandlers(() => ({
      getChat: () => currentChat,
      readFile: async () => ({ base64: 'aGVsbG8=', mimeType: 'image/png' }),
    }))

    const ctxOut = JSON.parse(
      (await handlers.getBuzzContext(invokeArgs('getBuzzContext'))).content,
    )
    expect(ctxOut.me.name).toBe('adam')

    const readOut = JSON.parse(
      (await handlers.readMessages(invokeArgs('readMessages', {}))).content,
    )
    expect(readOut.messages).toHaveLength(2)

    const dmOut = JSON.parse(
      (
        await handlers.sendDirectMessage(
          invokeArgs('sendDirectMessage', { to: 'ada', text: 'hello' }),
        )
      ).content,
    )
    expect(dmOut).toEqual({ sent: true, channelId: 'dm-ada', to: 'ada' })
    expect(sent[0]).toEqual(['dm-ada', 'hello'])

    const fileOut = JSON.parse(
      (
        await handlers.sendMediaFile(
          invokeArgs('sendMediaFile', {
            path: '/tmp/notes.png',
            caption: 'diagram',
          }),
        )
      ).content,
    )
    expect(fileOut).toEqual({
      sent: true,
      channelId: 'chan-general',
      name: 'notes.png',
    })
  })

  it('discoverAppTools lists and searches extended tools and describes schemas by name', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))

    const allExt = JSON.parse(
      (await handlers.discoverAppTools(invokeArgs('discoverAppTools', {})))
        .content,
    )
    expect(allExt.appSlug).toBe('buzz')
    expect(allExt.totalMatched).toBe(5)
    expect(allExt.operations.map((o: { name: string }) => o.name).sort()).toEqual(
      [...PUREBUZZ_EXTENDED_TOOL_NAMES].sort(),
    )
    for (const op of allExt.operations) {
      expect(op.invokeVia).toBe('callExtendedReadTool')
      expect(op.inputSchema).toBeDefined()
    }

    const byName = JSON.parse(
      (
        await handlers.discoverAppTools(
          invokeArgs('discoverAppTools', {
            names: ['listMembers', 'fn_catchUpBriefing', 'nonexistent'],
          }),
        )
      ).content,
    )
    expect(byName.mode).toBe('describe')
    expect(byName.operations[0]).toMatchObject({
      name: 'listMembers',
      found: true,
      invokeVia: 'callExtendedReadTool',
    })
    expect(byName.operations[1]).toMatchObject({
      name: 'fn_catchUpBriefing',
      found: true,
      invokeVia: 'direct',
    })
    expect(byName.operations[2]).toMatchObject({
      name: 'nonexistent',
      found: false,
    })
  })

  it('routes all 5 extended specialist read tools cleanly via callExtendedReadTool', async () => {
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()))

    const channels = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invokeArgs('callExtendedReadTool', { tool: 'listChannels' }),
        )
      ).content,
    )
    expect(channels).toHaveLength(4)

    const members = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invokeArgs('callExtendedReadTool', {
            tool: 'listMembers',
            arguments: { channelId: 'chan-general' },
          }),
        )
      ).content,
    )
    expect(members).toHaveLength(3)

    const search = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invokeArgs('callExtendedReadTool', {
            tool: 'searchMessages',
            arguments: { query: 'launch', channelId: 'chan-design' },
          }),
        )
      ).content,
    )
    expect(search.messages).toHaveLength(1)

    const latest = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invokeArgs('callExtendedReadTool', {
            tool: 'latestMessages',
            arguments: { from: 'bob', count: 5 },
          }),
        )
      ).content,
    )
    expect(latest.messages.length).toBeGreaterThanOrEqual(1)

    const media = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invokeArgs('callExtendedReadTool', {
            tool: 'listMedia',
            arguments: { channelId: 'chan-general' },
          }),
        )
      ).content,
    )
    expect(media.messages).toHaveLength(1)
  })

  it('enforces strict refusals on callExtendedReadTool and callExtendedTool, and runs beforeInvoke uniformly', async () => {
    const beforeInvoke = vi.fn()
    const handlers = buildPureBuzzHandlers(() => makeCtx(fakeChat()), {
      beforeInvoke,
    })

    // callExtendedReadTool refuses direct/release/unknown tools
    await expect(
      handlers.callExtendedReadTool(
        invokeArgs('callExtendedReadTool', { tool: 'sendMessage' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    await expect(
      handlers.callExtendedReadTool(
        invokeArgs('callExtendedReadTool', { tool: 'readMessages' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    await expect(
      handlers.callExtendedReadTool(
        invokeArgs('callExtendedReadTool', { tool: 'doesNotExist' }),
      ),
    ).rejects.toThrow(/Unknown extended tool/)

    // callExtendedTool refuses read-only extended tools, direct/release tools, and unknown tools
    await expect(
      handlers.callExtendedTool(
        invokeArgs('callExtendedTool', { tool: 'listChannels' }),
      ),
    ).rejects.toThrow(/read-only/)

    await expect(
      handlers.callExtendedTool(
        invokeArgs('callExtendedTool', { tool: 'sendMessage' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    await expect(
      handlers.callExtendedTool(
        invokeArgs('callExtendedTool', { tool: 'sendDirectMessage' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    await expect(
      handlers.callExtendedTool(
        invokeArgs('callExtendedTool', { tool: 'sendMediaFile' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    await expect(
      handlers.callExtendedTool(
        invokeArgs('callExtendedTool', { tool: '' }),
      ),
    ).rejects.toThrow(/"tool" is required/)

    // Verify beforeInvoke runs for direct, function, and extended calls
    await handlers.getBuzzContext(invokeArgs('getBuzzContext'))
    await handlers.fn_catchUpBriefing(invokeArgs('fn_catchUpBriefing', {}))
    await handlers.callExtendedReadTool(
      invokeArgs('callExtendedReadTool', { tool: 'listChannels' }),
    )

    expect(beforeInvoke).toHaveBeenCalledTimes(3)
    expect(beforeInvoke.mock.calls[0][0]).toMatchObject({
      name: 'getBuzzContext',
      opClass: 'tool',
      viaExtended: false,
    })
    expect(beforeInvoke.mock.calls[1][0]).toMatchObject({
      name: 'fn_catchUpBriefing',
      opClass: 'function',
      viaExtended: false,
    })
    expect(beforeInvoke.mock.calls[2][0]).toMatchObject({
      name: 'listChannels',
      opClass: 'tool',
      viaExtended: true,
    })
  })
})
