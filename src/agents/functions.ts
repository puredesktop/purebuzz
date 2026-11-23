import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import { npubOf, type BuzzChannel, type BuzzMessage } from '../lib/buzzProtocol'
import type { BuzzChatState } from '../hooks/useBuzzChat'
import {
  AgentBuzzToolError,
  channelDisplayName,
  describeMessage,
  findDmChannel,
  resolveChannelReference,
  resolvePerson,
  untrustedContentNote,
  type BuzzAgentToolContext,
} from './buzzAgentTools'

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function summarizeChannelEntry(chat: BuzzChatState, channel: BuzzChannel) {
  return {
    id: channel.id,
    name: channelDisplayName(chat, channel),
    type: channel.type,
    visibility: channel.visibility,
    members: chat.channelMembers[channel.id]?.length ?? null,
    unread: chat.unread[channel.id] ?? 0,
    muted: chat.muted.has(channel.id),
    isActive: channel.id === chat.activeChannelId,
  }
}

function mentionsCurrentUser(
  chat: BuzzChatState,
  message: BuzzMessage,
  text: string,
): boolean {
  if (chat.publicKey && message.mentions.includes(chat.publicKey)) return true
  const name = chat.displayName.trim()
  if (!name) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`@${escaped}\\b`, 'i').test(text)
}

function describeMessageWithActiveContext(
  chat: BuzzChatState,
  message: BuzzMessage,
  isActive: boolean,
): Record<string, unknown> | null {
  const base = describeMessage(chat, message, isActive)
  if (!base) return null
  if (isActive) {
    const reactions = chat.reactions[message.id]
    if (reactions) {
      const summary = Object.entries(reactions)
        .filter(([, entries]) => entries.length > 0)
        .map(([emoji, entries]) => ({ emoji, count: entries.length }))
      if (summary.length > 0) {
        base.reactions = summary
      }
    }
  }
  return base
}

async function loadChannelMessages(
  chat: BuzzChatState,
  channelId: string,
  limit: number,
): Promise<{ isActive: boolean; raw: BuzzMessage[] }> {
  const isActive = channelId === chat.activeChannelId
  const raw = isActive
    ? chat.messages.slice(-limit)
    : await chat.fetchMessages(channelId, limit)
  return { isActive, raw }
}

/**
 * Composite workflow 1: `fn_catchUpBriefing`
 * Replaces `getBuzzContext` + `listChannels` + N × `readMessages` in one call.
 */
const fnCatchUpBriefing = defineAppFunction<BuzzAgentToolContext>({
  name: 'fn_catchUpBriefing',
  category: 'briefing',
  risk: 'read',
  requiresApproval: false,
  replaces: ['getBuzzContext', 'listChannels', 'readMessages'],
  description:
    'Compile a complete Buzz catch-up briefing in one call: relay connection status, user identity, full channel and DM inventory with unread and muted counts, and recent messages across unread channels (or specified channels) with mentions, authors, and activity summaries. Prefer this over chaining getBuzzContext, listChannels, and repeated readMessages calls.',
  inputSchema: {
    type: 'object',
    properties: {
      channelIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of specific channel ids, channel names, or DM names to include. Omit to automatically catch up on all unread channels (falling back to the active channel if nothing is unread).',
      },
      messagesPerChannel: {
        type: 'number',
        description:
          'Maximum recent messages to fetch per channel (default 20, max 100).',
      },
      maxChannels: {
        type: 'number',
        description:
          'Maximum channels to fetch message histories for in one call (default 8, max 20).',
      },
      includeMuted: {
        type: 'boolean',
        description:
          'Include muted channels during automatic unread catch-up (default false).',
      },
      includeQuietChannels: {
        type: 'boolean',
        description:
          'When fewer than maxChannels are unread, also fetch recent messages from quiet non-muted channels (default false).',
      },
    },
  },
  run: async (ctx, args) => {
    const chat = ctx.getChat()
    const messagesPerChannel = clampInt(args.messagesPerChannel, 20, 1, 100)
    const maxChannels = clampInt(args.maxChannels, 8, 1, 20)
    const includeMuted = args.includeMuted === true
    const includeQuietChannels = args.includeQuietChannels === true

    const channels = chat.channels.map(ch => summarizeChannelEntry(chat, ch))
    const active = chat.channels.find(ch => ch.id === chat.activeChannelId)
    const unreadChannels = channels.filter(ch => ch.unread > 0)
    const totalUnreadMessages = unreadChannels.reduce(
      (sum, ch) => sum + ch.unread,
      0,
    )

    let targets: BuzzChannel[] = []
    if (Array.isArray(args.channelIds) && args.channelIds.length > 0) {
      const seen = new Set<string>()
      for (const ref of args.channelIds) {
        if (typeof ref !== 'string' || !ref.trim()) continue
        const resolved = resolveChannelReference(chat, ref)
        if (!seen.has(resolved.id)) {
          seen.add(resolved.id)
          targets.push(resolved)
        }
      }
    } else {
      const unreadTargets = chat.channels
        .filter(
          ch =>
            (chat.unread[ch.id] ?? 0) > 0 &&
            (includeMuted || !chat.muted.has(ch.id)),
        )
        .sort(
          (a, b) =>
            (chat.unread[b.id] ?? 0) - (chat.unread[a.id] ?? 0) ||
            channelDisplayName(chat, a).localeCompare(
              channelDisplayName(chat, b),
            ),
        )
      targets = [...unreadTargets]
      if (targets.length === 0 && active) {
        targets.push(active)
      }
      if (includeQuietChannels && targets.length < maxChannels) {
        const picked = new Set(targets.map(c => c.id))
        for (const ch of chat.channels) {
          if (targets.length >= maxChannels) break
          if (picked.has(ch.id)) continue
          if (!includeMuted && chat.muted.has(ch.id)) continue
          picked.add(ch.id)
          targets.push(ch)
        }
      }
    }

    const selectedTargets = targets.slice(0, maxChannels)
    const briefings = await Promise.all(
      selectedTargets.map(async channel => {
        const { isActive, raw } = await loadChannelMessages(
          chat,
          channel.id,
          messagesPerChannel,
        )
        const described: Record<string, unknown>[] = []
        const authors = new Set<string>()
        let replyCount = 0
        let attachmentCount = 0
        let mentionsMeCount = 0
        let latestAt: string | null = null

        for (const msg of raw) {
          const item = describeMessageWithActiveContext(chat, msg, isActive)
          if (!item) continue
          described.push(item)
          authors.add(String(item.author))
          if (msg.parentId) replyCount += 1
          attachmentCount += msg.media.length
          if (mentionsCurrentUser(chat, msg, String(item.text ?? ''))) {
            mentionsMeCount += 1
          }
          latestAt = String(item.at)
        }

        return {
          channel: summarizeChannelEntry(chat, channel),
          messageCount: described.length,
          authors: [...authors],
          replyCount,
          attachmentCount,
          mentionsMeCount,
          latestAt,
          messages: described,
        }
      }),
    )

    const totalMentions = briefings.reduce(
      (sum, entry) => sum + entry.mentionsMeCount,
      0,
    )
    const summary = `Buzz catch-up (${chat.status}): ${channels.length} channels (${unreadChannels.length} unread, ${totalUnreadMessages} unread msgs); briefed ${briefings.length} channel(s)${totalMentions ? `, ${totalMentions} mention(s) of you` : ''}.`

    return {
      summary,
      mutated: false,
      data: {
        _note: untrustedContentNote(
          'compile a catch-up briefing across Buzz channels',
        ),
        context: {
          status: chat.status,
          relay: chat.relayUrl,
          me: {
            npub: chat.publicKey ? npubOf(chat.publicKey) : null,
            name: chat.displayName || null,
          },
          activeChannel: active
            ? {
                id: active.id,
                name: channelDisplayName(chat, active),
                type: active.type,
              }
            : null,
          totalChannels: channels.length,
          unreadChannelCount: unreadChannels.length,
          totalUnreadMessages,
          mutedChannelCount: chat.muted.size,
        },
        channels,
        briefings,
        truncatedChannels: Math.max(0, targets.length - selectedTargets.length),
      },
    }
  },
})

/**
 * Composite workflow 2: `fn_channelSnapshot`
 * Replaces `listChannels` + `listMembers` + `readMessages` + `listMedia` in one call.
 */
const fnChannelSnapshot = defineAppFunction<BuzzAgentToolContext>({
  name: 'fn_channelSnapshot',
  category: 'channels',
  risk: 'read',
  requiresApproval: false,
  replaces: ['listChannels', 'listMembers', 'readMessages', 'listMedia'],
  description:
    'Inspect a Buzz channel or direct-message conversation in one call (resolved by channel id, channel name, or DM participant name): channel metadata, member roster with live online presence, recent messages with active edit/delete overlays and reactions, and shared media attachments.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description:
          'Channel id, channel name (with or without leading "#"), or DM participant display name. Defaults to the active channel.',
      },
      messageLimit: {
        type: 'number',
        description:
          'Maximum recent messages to return, oldest first (default 40, max 200).',
      },
      mediaLimit: {
        type: 'number',
        description:
          'Maximum recent media attachments to return (default 15, max 50; set 0 to omit media).',
      },
      includeOfflineMembers: {
        type: 'boolean',
        description:
          'Include offline members in the roster listing (default true; false returns online members only).',
      },
    },
  },
  run: async (ctx, args) => {
    const chat = ctx.getChat()
    const channel = resolveChannelReference(chat, args.channel)
    const messageLimit = clampInt(args.messageLimit, 40, 1, 200)
    const mediaLimit = clampInt(args.mediaLimit, 15, 0, 50)
    const includeOfflineMembers = args.includeOfflineMembers !== false

    const isActive = channel.id === chat.activeChannelId
    const fetchLimit =
      mediaLimit > 0 ? Math.min(Math.max(messageLimit, 100), 200) : messageLimit
    const allRaw = isActive
      ? chat.messages
      : await chat.fetchMessages(channel.id, fetchLimit)

    const recentSlice = allRaw.slice(-messageLimit)
    const messages = recentSlice
      .map(msg => describeMessageWithActiveContext(chat, msg, isActive))
      .filter((item): item is Record<string, unknown> => item !== null)

    const media =
      mediaLimit > 0
        ? allRaw
            .filter(msg => !(isActive && chat.deleted[msg.id]))
            .filter(msg => msg.media.length > 0)
            .flatMap(msg =>
              msg.media.map(entry => ({
                url: entry.url,
                mime: entry.mime,
                author: chat.nameFor(msg.pubkey),
                at: new Date(msg.createdAt * 1000).toISOString(),
                messageId: msg.id,
              })),
            )
            .slice(-mediaLimit)
        : []

    const fullRoster = (chat.channelMembers[channel.id] ?? [])
      .map(member => ({
        name: chat.nameFor(member.pubkey),
        npub: npubOf(member.pubkey),
        role: member.role,
        online: chat.presence[member.pubkey] === true,
      }))
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
      )

    const onlineMembers = fullRoster.filter(m => m.online)
    const roster = includeOfflineMembers ? fullRoster : onlineMembers

    const displayName = channelDisplayName(chat, channel)
    const summary = `Channel snapshot for ${channel.type === 'channel' ? `#${displayName}` : `DM ${displayName}`}: ${messages.length} message(s), ${fullRoster.length} member(s) (${onlineMembers.length} online), ${media.length} media item(s).`

    return {
      summary,
      mutated: false,
      data: {
        _note: untrustedContentNote(
          'inspect this channel’s messages, roster, and shared media',
        ),
        channel: {
          ...summarizeChannelEntry(chat, channel),
          about: channel.about,
        },
        roster: {
          totalMembers: fullRoster.length,
          onlineCount: onlineMembers.length,
          members: roster,
        },
        messageCount: messages.length,
        messages,
        mediaCount: media.length,
        media,
      },
    }
  },
})

/**
 * Composite workflow 3: `fn_personActivityDossier`
 * Replaces `listChannels` + `listMembers` + `latestMessages` + `readMessages` + `listMedia` in one call.
 */
const fnPersonActivityDossier = defineAppFunction<BuzzAgentToolContext>({
  name: 'fn_personActivityDossier',
  category: 'people',
  risk: 'read',
  requiresApproval: false,
  replaces: [
    'listChannels',
    'listMembers',
    'latestMessages',
    'readMessages',
    'listMedia',
  ],
  description:
    'Build a complete Buzz activity dossier for one person (resolved by display name, npub, or hex key): profile identity, live online presence, shared channels and roles, existing DM status and recent DM messages, cross-channel recent messages, and shared media attachments.',
  inputSchema: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        description:
          'Person to inspect: display name (case-insensitive), npub, or 64-char hex pubkey.',
      },
      messageLimit: {
        type: 'number',
        description:
          'Maximum cross-channel recent messages by this person (default 15, max 50).',
      },
      includeDmContext: {
        type: 'boolean',
        description:
          'Include recent messages from the existing 1:1 DM with this person if one exists (default true).',
      },
      dmMessageLimit: {
        type: 'number',
        description:
          'Maximum recent messages to include from the 1:1 DM (default 15, max 50).',
      },
      includeMedia: {
        type: 'boolean',
        description:
          'Include media attachments shared by this person across returned messages (default true).',
      },
    },
    required: ['person'],
  },
  run: async (ctx, args) => {
    const chat = ctx.getChat()
    const pubkey = resolvePerson(chat, args.person)
    const messageLimit = clampInt(args.messageLimit, 15, 1, 50)
    const includeDmContext = args.includeDmContext !== false
    const dmMessageLimit = clampInt(args.dmMessageLimit, 15, 1, 50)
    const includeMedia = args.includeMedia !== false

    const displayName = chat.nameFor(pubkey)
    const isSelf = pubkey === chat.publicKey

    const sharedChannels = chat.channels
      .map(channel => {
        const membership = (chat.channelMembers[channel.id] ?? []).find(
          member => member.pubkey === pubkey,
        )
        const isDmParticipant =
          channel.type === 'dm' && channel.participants.includes(pubkey)
        if (!membership && !isDmParticipant) return null
        return {
          id: channel.id,
          name: channelDisplayName(chat, channel),
          type: channel.type,
          visibility: channel.visibility,
          role: membership?.role ?? 'member',
          unread: chat.unread[channel.id] ?? 0,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    const dmChannelId = isSelf ? null : findDmChannel(chat, pubkey)
    const dmMessagesPromise: Promise<Record<string, unknown>[]> =
      dmChannelId && includeDmContext
        ? loadChannelMessages(chat, dmChannelId, dmMessageLimit).then(
            ({ isActive, raw }) =>
              raw
                .map(msg =>
                  describeMessageWithActiveContext(chat, msg, isActive),
                )
                .filter(
                  (item): item is Record<string, unknown> => item !== null,
                ),
          )
        : Promise.resolve([])

    const latestPromise = chat.fetchLatest({
      authorHex: pubkey,
      limit: messageLimit,
    })

    const [dmMessages, latestRaw] = await Promise.all([
      dmMessagesPromise,
      latestPromise,
    ])

    const channelLabel = (id: string): string => {
      const ch = chat.channels.find(c => c.id === id)
      return ch ? channelDisplayName(chat, ch) : id
    }

    const recentMessages = latestRaw
      .map(msg => {
        const isActive = msg.channelId === chat.activeChannelId
        const item = describeMessageWithActiveContext(chat, msg, isActive)
        if (!item) return null
        return {
          ...item,
          channelId: msg.channelId,
          channel: channelLabel(msg.channelId),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const media: Array<{
      url: string
      mime: string
      channelId: string
      channel: string
      at: string
      messageId: string
    }> = []

    if (includeMedia) {
      const seenMedia = new Set<string>()
      const collectFrom = (msgs: BuzzMessage[]) => {
        for (const msg of msgs) {
          if (msg.pubkey !== pubkey) continue
          if (msg.channelId === chat.activeChannelId && chat.deleted[msg.id]) {
            continue
          }
          for (const entry of msg.media) {
            const key = `${msg.id}:${entry.url}`
            if (seenMedia.has(key)) continue
            seenMedia.add(key)
            media.push({
              url: entry.url,
              mime: entry.mime,
              channelId: msg.channelId,
              channel: channelLabel(msg.channelId),
              at: new Date(msg.createdAt * 1000).toISOString(),
              messageId: msg.id,
            })
          }
        }
      }
      collectFrom(latestRaw)
      collectFrom(chat.messages)
    }

    const online = chat.presence[pubkey] === true
    const summary = `Activity dossier for ${displayName} (${online ? 'online' : 'offline'}): ${sharedChannels.length} shared channel(s), ${recentMessages.length} recent message(s)${dmChannelId ? `, existing DM (${dmMessages.length} loaded)` : ', no existing DM'}.`

    return {
      summary,
      mutated: false,
      data: {
        _note: untrustedContentNote(
          'review this person’s recent Buzz activity and DM context',
        ),
        person: {
          name: displayName,
          npub: npubOf(pubkey),
          pubkey,
          email: chat.emails[pubkey] ?? null,
          online,
          isSelf,
        },
        sharedChannels,
        dm: dmChannelId
          ? {
              exists: true,
              channelId: dmChannelId,
              unread: chat.unread[dmChannelId] ?? 0,
              messages: dmMessages,
            }
          : {
              exists: false,
              channelId: null,
              unread: 0,
              messages: [],
            },
        recentMessages,
        media,
      },
    }
  },
})

/**
 * Composite workflow 4: `fn_searchBuzzTopics`
 * Replaces `listChannels` + N × `searchMessages` in one cross-channel call.
 */
const fnSearchBuzzTopics = defineAppFunction<BuzzAgentToolContext>({
  name: 'fn_searchBuzzTopics',
  category: 'search',
  risk: 'read',
  requiresApproval: false,
  replaces: ['listChannels', 'searchMessages', 'latestMessages'],
  description:
    'Search across every Buzz channel and DM (or a named subset of channels) in one call, optionally filtered to one author, returning matching messages grouped by channel with channel display names, match counts, timestamps, and author summaries.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Full-text search terms to look up across the relay.',
      },
      channels: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional subset of channel ids, channel names, or DM names to search. Omit to search every channel the user can read.',
      },
      from: {
        type: 'string',
        description:
          'Optional author filter: display name, npub, or hex pubkey.',
      },
      limit: {
        type: 'number',
        description:
          'Maximum total matching messages returned, newest first (default 30, max 100).',
      },
    },
    required: ['query'],
  },
  run: async (ctx, args) => {
    const chat = ctx.getChat()
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) throw new AgentBuzzToolError('query is required')

    const limit = clampInt(args.limit, 30, 1, 100)
    const fromRaw = typeof args.from === 'string' ? args.from.trim() : ''
    const authorHex = fromRaw ? resolvePerson(chat, fromRaw) : undefined

    let rawMatches: BuzzMessage[]
    let scope: string[] | 'all'
    if (Array.isArray(args.channels) && args.channels.length > 0) {
      const resolvedChannels: BuzzChannel[] = []
      const seen = new Set<string>()
      for (const ref of args.channels) {
        if (typeof ref !== 'string' || !ref.trim()) continue
        const ch = resolveChannelReference(chat, ref)
        if (!seen.has(ch.id)) {
          seen.add(ch.id)
          resolvedChannels.push(ch)
        }
      }
      scope = resolvedChannels.map(c => c.id)
      const perChannel = await Promise.all(
        resolvedChannels.map(ch => chat.searchIn(ch.id, query)),
      )
      rawMatches = perChannel
        .flat()
        .sort((a, b) => b.createdAt - a.createdAt)
    } else {
      scope = 'all'
      rawMatches = await chat.searchAll(query)
    }

    const filtered = rawMatches
      .filter(msg => !authorHex || msg.pubkey === authorHex)
      .filter(
        msg =>
          !(msg.channelId === chat.activeChannelId && chat.deleted[msg.id]),
      )

    const capped = filtered.slice(0, limit)
    const grouped = new Map<
      string,
      {
        channelId: string
        channelName: string
        channelType: 'channel' | 'dm' | 'unknown'
        latestAt: string
        latestTs: number
        messages: Record<string, unknown>[]
      }
    >()
    const authors = new Set<string>()

    for (const msg of capped) {
      const isActive = msg.channelId === chat.activeChannelId
      const described = describeMessageWithActiveContext(chat, msg, isActive)
      if (!described) continue
      authors.add(String(described.author))
      const ch = chat.channels.find(c => c.id === msg.channelId)
      const existing = grouped.get(msg.channelId)
      if (existing) {
        existing.messages.push(described)
        if (msg.createdAt > existing.latestTs) {
          existing.latestTs = msg.createdAt
          existing.latestAt = String(described.at)
        }
      } else {
        grouped.set(msg.channelId, {
          channelId: msg.channelId,
          channelName: ch ? channelDisplayName(chat, ch) : msg.channelId,
          channelType: ch?.type ?? 'unknown',
          latestAt: String(described.at),
          latestTs: msg.createdAt,
          messages: [described],
        })
      }
    }

    const byChannel = [...grouped.values()]
      .sort((a, b) => b.latestTs - a.latestTs)
      .map(({ latestTs: _ts, ...rest }) => ({
        ...rest,
        matchCount: rest.messages.length,
      }))

    const summary = `Search for "${query}"${authorHex ? ` by ${chat.nameFor(authorHex)}` : ''}: ${capped.length} match(es) across ${byChannel.length} channel(s)${filtered.length > capped.length ? ` (${filtered.length} total)` : ''}.`

    return {
      summary,
      mutated: false,
      data: {
        _note: untrustedContentNote(
          'review messages matching the search query across Buzz channels',
        ),
        query,
        scope,
        authorFilter: authorHex ? chat.nameFor(authorHex) : null,
        totalMatches: filtered.length,
        returnedMatches: capped.length,
        matchedAuthors: [...authors],
        byChannel,
      },
    }
  },
})

export const PUREBUZZ_FUNCTIONS: readonly AppFunctionDefinition<BuzzAgentToolContext>[] =
  [
    fnCatchUpBriefing,
    fnChannelSnapshot,
    fnPersonActivityDossier,
    fnSearchBuzzTopics,
  ]
