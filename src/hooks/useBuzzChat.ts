import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildCreateChannelEvent,
  buildEditMetadataEvent,
  buildJoinRequestEvent,
  buildLeaveEvent,
  buildRemoveUserEvent,
  buildPresenceEvent,
  buildPutUserEvent,
  membersFromEvent,
  parsePubkey,
  presenceFromEvent,
  KIND_GROUP_MEMBERS,
  KIND_PRESENCE,
  KIND_MEMBERSHIP_LIST,
  relayRosterFromEvent,
  type ChannelMember,
  buildDeleteEvent,
  buildDeleteGroupEvent,
  buildDmOpenEvent,
  buildEditEvent,
  buildMessageEvent,
  buildReactionEvent,
  buildReplyTags,
  mentionTags,
  deletionFromEvent,
  editFromEvent,
  KIND_DELETION,
  KIND_EDIT,
  buildTypingEvent,
  imetaTag,
  reactionFromEvent,
  typingFromEvent,
  KIND_REACTION,
  KIND_TYPING,
  buildProfileEvent,
  channelFromMetadata,
  generateKeypair,
  keypairFromSecret,
  messageFromEvent,
  profileFromEvent,
  shortPubkey,
  KIND_GROUP_METADATA,
  KIND_PROFILE,
  KIND_STREAM_MESSAGE,
  isValidRelayUrl,
  normalizeRelayUrl,
  nsecOf,
  parseSecret,
  type BuzzChannel,
  type BuzzKeypair,
  type BuzzMessage,
  type SignedEvent,
} from '../lib/buzzProtocol'
import {
  RelayConnection,
  type ConnectionStatus,
} from '../lib/relayConnection'
import {
  claimInvite,
  mintInvite,
  parseInviteInput,
  type MintedInvite,
} from '../lib/invites'
import { queryPresence, searchChannel } from '../lib/relayQuery'
import { fetchMediaAsDataUrl, uploadFile } from '../lib/media'
import {
  fetchBuzzSettings,
  isStandaloneDevMode,
  migrateLocalStorageKey,
  readSecretKey,
  storeSecretKey,
  updateBuzzSettings,
} from '../bridge/platformBridge'

/**
 * The app's whole chat session: identity, connection, channels, messages.
 *
 * Identity is a device keypair in the shell's secrets store; the relay
 * address is an app setting. The user never sees a key — the app generates
 * one on first run and signs with it from then on. Losing the device still
 * loses the identity; the escrow design in BUZZ_EVALUATION.md is the
 * follow-on that removes that cliff.
 */

const DEFAULT_RELAY = 'ws://localhost:3000'

/**
 * Identity comes from the shell's secrets store (OS-keystore encrypted,
 * scoped to this app); the relay address from app settings. The first run
 * generates a key and stores it; a key left in localStorage by the first
 * day of the pilot is migrated in rather than abandoned.
 */
async function loadIdentityAndSettings(): Promise<{
  keypair: BuzzKeypair
  relayUrl: string
  keyStorage: KeyStorageState
  lastRead: Record<string, number>
  muted: string[]
  hiddenDms: string[]
  linkPreviews: 'off' | 'channels' | 'all'
  lastChannel: string | null
}> {
  const settings = await fetchBuzzSettings().catch(() => ({}) as never)
  const lastRead = settings.lastRead ?? {}
  const muted = settings.muted ?? []
  const linkPreviews = settings.linkPreviews ?? 'channels'
  const hiddenDms = settings.hiddenDms ?? []
  const lastChannel = settings.lastChannel ?? null
  // Normalize and validate what was saved: a stray-quoted or scheme-less URL
  // must fall back to the default, not be handed to the WebSocket constructor.
  const saved = normalizeRelayUrl(settings.relayUrl ?? '')
  const relayUrl = isValidRelayUrl(saved) ? saved : DEFAULT_RELAY

  let secret = await readSecretKey().catch(() => null)
  if (!secret) secret = await migrateLocalStorageKey().catch(() => null)
  // Running under vite outside the shell there is no keystore to use, so the
  // key lives in localStorage in the clear. That is an acceptable dev
  // convenience and an unacceptable thing to leave unsaid.
  const stored: KeyStorageState = isStandaloneDevMode()
    ? { kind: 'unencrypted-dev' }
    : { kind: 'stored' }
  if (secret) {
    try {
      return {
        keypair: keypairFromSecret(secret),
        relayUrl,
        keyStorage: stored,
        lastRead,
        muted,
        hiddenDms,
        linkPreviews,
        lastChannel,
      }
    } catch {
      // corrupt key — fall through to a fresh one
    }
  }
  const fresh = generateKeypair()
  try {
    await storeSecretKey(fresh.secretKey)
    return { keypair: fresh, relayUrl, keyStorage: stored, lastRead, muted, hiddenDms, linkPreviews, lastChannel }
  } catch (error) {
    // The save was refused (no keystore) or failed. Both used to be
    // swallowed, which left the app running as an identity that was never
    // written down — so the next launch was silently a different person, with
    // no way back into the channels this one had joined. Keep the key for the
    // session only, and say so.
    return {
      keypair: fresh,
      relayUrl,
      lastRead,
      muted,
      hiddenDms,
      linkPreviews,
      lastChannel,
      keyStorage: {
        kind: 'session-only',
        reason:
          error instanceof Error
            ? error.message
            : 'The identity key could not be saved.',
      },
    }
  }
}

/**
 * Where this device's identity key lives. `session-only` means it was never
 * written: the app is usable, but quitting loses the identity — which the
 * user has to be told, not left to discover.
 */
export type KeyStorageState =
  | { kind: 'stored' }
  | { kind: 'session-only'; reason: string }
  /** Standalone dev outside the shell: localStorage, in the clear. */
  | { kind: 'unencrypted-dev' }

export interface ReactionEntry {
  pubkey: string
  eventId: string
}

export interface BuzzChatState {
  status: ConnectionStatus
  /** Whether the identity key is safely stored, and why not when it is not. */
  keyStorage: KeyStorageState
  statusDetail: string | null
  relayUrl: string
  publicKey: string
  /** Own display name, empty until set. */
  displayName: string
  /** Resolve any pubkey to its display name, falling back to a short key. */
  nameFor: (pubkey: string) => string
  /** pubkey → display name, as learned from kind:0 profiles. */
  names: Record<string, string>
  /** pubkey → self-reported email (kind:0 nip05) — a label, not proof. */
  emails: Record<string, string>
  setDisplayName: (name: string) => Promise<string | null>
  channels: BuzzChannel[]
  activeChannelId: string | null
  messages: BuzzMessage[]
  /** True when scrollback plausibly continues past the oldest loaded message. */
  hasOlder: boolean
  /** Fetch the previous page of history; resolves when it has arrived. */
  loadOlder: () => Promise<void>
  /** Full-text search in the active channel; newest first. */
  searchMessages: (query: string) => Promise<BuzzMessage[]>
  /** One-shot history read for ANY channel, without touching view state. */
  fetchMessages: (channelId: string, limit?: number) => Promise<BuzzMessage[]>
  /**
   * Newest messages first, optionally scoped to a channel and/or an author —
   * author-only spans every channel the user can read.
   */
  fetchLatest: (opts: {
    channelId?: string
    authorHex?: string
    limit: number
  }) => Promise<BuzzMessage[]>
  /** Search an arbitrary channel (agent surface). */
  searchIn: (channelId: string, query: string) => Promise<BuzzMessage[]>
  /** Search every channel the user can read, newest first. */
  searchAll: (query: string) => Promise<BuzzMessage[]>
  /** Send to an arbitrary channel (agent surface). */
  sendTo: (channelId: string, text: string) => Promise<string | null>
  /** channelId → roster from the relay's kind:39002 discovery events. */
  channelMembers: Record<string, ChannelMember[]>
  /** pubkey → online right now (kind:20001 deltas + queried snapshots). */
  presence: Record<string, boolean>
  /** channelId → unread message count since the user last looked. */
  unread: Record<string, number>
  /** Mark a conversation read right now. */
  markRead: (channelId: string) => void
  /** Channels the user muted (no unread counting). */
  muted: Set<string>
  toggleMute: (channelId: string) => void
  /** DMs the user closed; they reopen on new activity. */
  hiddenDms: Set<string>
  hideDm: (channelId: string) => void
  /** Link-card unfurling policy (see PureBuzzSettings.linkPreviews). */
  linkPreviews: 'off' | 'channels' | 'all'
  /** channelId → pubkeys currently typing (self excluded). */
  typers: Record<string, Record<string, number>>
  /** messageId → emoji → reactors, each with their reaction event id. */
  reactions: Record<string, Record<string, ReactionEntry[]>>
  /** messageId → latest replacement text (kind:40003 edits). */
  edits: Record<string, { text: string; at: number }>
  /** messageId → true when a kind:5 removed it. */
  deleted: Record<string, true>
  /** Replace one of your own messages' text. */
  sendEdit: (targetId: string, text: string) => Promise<string | null>
  /** Delete one of your own messages. */
  sendDelete: (targetId: string) => Promise<string | null>
  /** Throttled typing ping for the active channel; call on each keystroke. */
  notifyTyping: () => void
  sendReaction: (targetId: string, emoji: string) => Promise<string | null>
  selectChannel: (id: string) => void
  sendMessage: (
    text: string,
    replyTo?: { parentId: string; rootId: string | null },
    mentions?: string[],
  ) => Promise<string | null>
  /**
   * Upload a file to the relay's media store and post it — together with any
   * typed text — as one message to the active channel.
   */
  sendFile: (
    file: File,
    text?: string,
    targetChannelId?: string,
  ) => Promise<string | null>
  /** Authenticated fetch of a relay media URL as a data: URL, cached. */
  resolveMedia: (url: string) => Promise<string>
  createChannel: (
    name: string,
    visibility?: 'open' | 'private',
  ) => Promise<string | null>
  /** Add a person (npub or hex pubkey) to a channel via NIP-29 put-user. */
  addToChannel: (
    channelId: string,
    pubkeyInput: string,
  ) => Promise<string | null>
  /** Rename a channel (owners/admins; the relay enforces). */
  renameChannel: (channelId: string, name: string) => Promise<string | null>
  /** Leave a channel; it drops from the sidebar immediately. */
  leaveChannel: (channelId: string) => Promise<string | null>
  /** Remove a member from a channel (owners/admins; the relay enforces). */
  removeFromChannel: (
    channelId: string,
    pubkey: string,
  ) => Promise<string | null>
  /** Erase a channel for everyone (owner only; the relay enforces). */
  deleteChannel: (channelId: string) => Promise<string | null>
  /** Flip a legacy open channel to private (owners/admins). */
  makeChannelPrivate: (channelId: string) => Promise<string | null>
  setRelayUrl: (url: string) => void
  joinWithInvite: (
    code: string,
    identity?: { name: string; email: string },
  ) => Promise<string | null>
  /** Mint a single-use invite code; throws with the relay's reason. */
  createInvite: (ttlSecs?: number) => Promise<MintedInvite>
  /**
   * People who joined the relay after you minted an invite, waiting for a
   * decision: add them to the channel the invite was minted from, or not.
   */
  joinPrompts: { pubkey: string; channelId: string }[]
  /** Settle one prompt: add=true puts them in the channel; false dismisses. */
  resolveJoinPrompt: (pubkey: string, add: boolean) => Promise<string | null>
  /** Open (or reuse) a DM with one person by npub/hex key. */
  openDm: (pubkeyInput: string) => Promise<string | null>
  /** The SECRET key as an nsec, for backup. Null until identity loads. */
  exportIdentity: () => string | null
  /** Replace this device's identity with a pasted nsec/hex secret. */
  importIdentity: (input: string) => Promise<string | null>
}

export function useBuzzChat(): BuzzChatState {
  const [keypair, setKeypair] = useState<BuzzKeypair | null>(null)
  const [keyStorage, setKeyStorage] = useState<KeyStorageState>({
    kind: 'stored',
  })
  const [relayUrl, setRelayUrlState] = useState(DEFAULT_RELAY)

  // Boot: settings and identity arrive over the bridge before connecting.
  useEffect(() => {
    let cancelled = false
    void loadIdentityAndSettings().then(
      ({
        keypair: pair,
        relayUrl: url,
        keyStorage: storage,
        lastRead: read,
        muted: mutedList,
        hiddenDms: hiddenList,
        linkPreviews: previews,
        lastChannel: last,
      }) => {
        if (cancelled) return
        setRelayUrlState(url)
        setKeypair(pair)
        setKeyStorage(storage)
        setLastRead(read)
        setMuted(new Set(mutedList))
        setHiddenDms(new Set(hiddenList))
        setLinkPreviews(previews)
        pendingRestoreRef.current = last
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [channels, setChannels] = useState<BuzzChannel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<BuzzMessage[]>([])
  // Whether the channel plausibly has messages older than what is loaded.
  const [hasOlder, setHasOlder] = useState(false)
  // pubkey → display name / self-reported email, from kind:0 profiles.
  const [names, setNames] = useState<Record<string, string>>({})
  const [emails, setEmails] = useState<Record<string, string>>({})
  const connectionRef = useRef<RelayConnection | null>(null)
  const messagesRef = useRef<BuzzMessage[]>([])
  messagesRef.current = messages
  const joinedRef = useRef<Set<string>>(new Set())
  const profileWatchRef = useRef<Set<string>>(new Set())

  // channelId → unix seconds: what the user has seen vs what has happened.
  const [lastRead, setLastRead] = useState<Record<string, number>>({})
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [hiddenDms, setHiddenDms] = useState<Set<string>>(new Set())
  const [linkPreviews, setLinkPreviews] = useState<'off' | 'channels' | 'all'>(
    'channels',
  )
  // The conversation open at last quit; adopted once discovery confirms it.
  const pendingRestoreRef = useRef<string | null>(null)
  // channelId → recent message timestamps (capped) — counts, not just a flag.
  const [activityTimes, setActivityTimes] = useState<Record<string, number[]>>(
    {},
  )
  // channelId → pubkey → expiry ms: who is typing, per the 8s convention.
  const [typers, setTypers] = useState<
    Record<string, Record<string, number>>
  >({})
  // messageId → emoji → who reacted, with the reaction event id so the
  // author can take it back (unreact = NIP-09 delete of that event).
  const [reactions, setReactions] = useState<
    Record<string, Record<string, ReactionEntry[]>>
  >({})
  // Overlay state for the active channel: replacement texts and removals.
  const [edits, setEdits] = useState<Record<string, { text: string; at: number }>>(
    {},
  )
  const [deleted, setDeleted] = useState<Record<string, true>>({})
  const lastTypingSentRef = useRef(0)
  // Relay roster diffing: null until the first roster (the baseline) lands.
  const relayRosterRef = useRef<Set<string> | null>(null)
  const pendingInvitesRef = useRef<{ channelId: string; at: number }[]>([])
  const [joinPrompts, setJoinPrompts] = useState<
    { pubkey: string; channelId: string }[]
  >([])

  // channelId → roster, from relay-signed kind:39002 discovery events.
  const [channelMembers, setChannelMembers] = useState<
    Record<string, ChannelMember[]>
  >({})
  // pubkey → online, from kind:20001 (live deltas + queried snapshots).
  const [presence, setPresence] = useState<Record<string, boolean>>({})

  const absorbChannelMetadata = useCallback((event: SignedEvent): void => {
    const channel = channelFromMetadata(event)
    if (channel) {
      setChannels(current => {
        const rest = current.filter(entry => entry.id !== channel.id)
        return [...rest, channel].sort((a, b) => a.name.localeCompare(b.name))
      })
      return
    }
    const roster = membersFromEvent(event)
    if (roster) {
      setChannelMembers(current => ({
        ...current,
        [roster.channelId]: roster.members,
      }))
    }
  }, [])

  /**
   * The relay serves kind:39000 channel metadata as HISTORY only — a new
   * channel's metadata is never pushed to an open subscription (verified
   * against the live relay: create OK, nothing broadcast). So the channel
   * list re-queries in a short-lived subscription whenever something changes
   * the set: a create, a claimed invite. One immediate pass plus one delayed,
   * because the relay writes the metadata sidecar after the create's OK.
   */
  const refreshChannels = useCallback(() => {
    const connection = connectionRef.current
    if (!connection) return
    const query = (): void => {
      const off = connection.subscribe(
        [{ kinds: [KIND_GROUP_METADATA] }, { kinds: [KIND_GROUP_MEMBERS] }],
        absorbChannelMetadata,
        () => off(),
      )
    }
    query()
    window.setTimeout(query, 900)
  }, [absorbChannelMetadata])

  // One connection per relay url; channel metadata subscription rides on it.
  useEffect(() => {
    if (!keypair) return undefined
    // A replaced connection's socket closes AFTER its successor is live, and
    // that late 'closed' must not clobber the new connection's status.
    let disposed = false
    const connection = new RelayConnection({
      url: relayUrl,
      keypair,
      onStatus: (next, detail) => {
        if (disposed) return
        setStatus(next)
        setStatusDetail(detail ?? null)
      },
    })
    connectionRef.current = connection
    profileWatchRef.current = new Set()
    setNames({})
    setEmails({})
    setChannelMembers({})
    setPresence({})
    setActivityTimes({})
    relayRosterRef.current = null
    setJoinPrompts([])
    setTypers({})
    setReactions({})
    mediaCacheRef.current = new Map()
    // Channel metadata (kind:39000) is stored channel-scoped on the relay and
    // never pushed to a subscription — clients discover channels only by
    // querying history. So the list is a query at connect plus a gentle poll.
    //
    // The poll's real ceiling is the relay's, not the interval's: verified
    // directly against the relay, a channel a DIFFERENT identity just created
    // is not served to a non-member on historical query in this build (Block's
    // own code calls live open-channel discovery a future enhancement). So the
    // poll reliably surfaces this user's own creates/joins and any channel
    // once the relay makes it discoverable to them — not every channel the
    // instant someone else makes it.
    const offChannels = connection.subscribe(
      [{ kinds: [KIND_GROUP_METADATA] }, { kinds: [KIND_GROUP_MEMBERS] }],
      absorbChannelMetadata,
    )
    const poll = window.setInterval(refreshChannels, 15000)
    // Presence deltas are ephemeral broadcasts — the only live kind here.
    const offPresence = connection.subscribe(
      [{ kinds: [KIND_PRESENCE] }],
      event => {
        const parsed = presenceFromEvent(event)
        if (parsed)
          setPresence(current => ({
            ...current,
            [parsed.pubkey]: parsed.online,
          }))
      },
    )
    // Activity across ALL my channels — a recent-history seed plus live —
    // feeds the unread dots; the per-channel message view is separate.
    const offActivity = connection.subscribe(
      [
        {
          kinds: [KIND_STREAM_MESSAGE],
          since: Math.floor(Date.now() / 1000) - 7 * 86400,
          limit: 500,
        },
      ],
      event => {
        const message = messageFromEvent(event)
        if (!message) return
        setHiddenDms(current => {
          if (!current.has(message.channelId)) return current
          const next = new Set(current)
          next.delete(message.channelId)
          void updateBuzzSettings({ hiddenDms: [...next] }).catch(() => undefined)
          return next
        })
        setActivityTimes(current => {
          const seen = current[message.channelId] ?? []
          if (seen.includes(message.createdAt)) {
            // Same-second collisions are possible but rare; a missed +1 on a
            // badge is acceptable, double-count on re-delivery is not.
            return current
          }
          const next = [...seen, message.createdAt].sort((a, b) => a - b)
          return {
            ...current,
            [message.channelId]: next.slice(-99),
          }
        })
      },
    )
    // The relay membership roster: when a NEW key appears shortly after we
    // minted an invite, that is almost certainly our invitee — offer to add
    // them to the channel the invite came from. Explicit auth, one click.
    const offRoster = connection.subscribe(
      [{ kinds: [KIND_MEMBERSHIP_LIST] }],
      event => {
        const roster = relayRosterFromEvent(event)
        if (!roster) return
        const next = new Set(roster)
        const previous = relayRosterRef.current
        relayRosterRef.current = next
        if (!previous) return
        const fresh = [...next].filter(
          pubkey => !previous.has(pubkey) && pubkey !== keypair.publicKey,
        )
        if (fresh.length === 0) return
        const hourAgo = Date.now() - 3_600_000
        const invites = pendingInvitesRef.current.filter(
          invite => invite.at > hourAgo,
        )
        pendingInvitesRef.current = invites
        if (invites.length === 0) return
        const channelId = invites[invites.length - 1].channelId
        setJoinPrompts(current => [
          ...current,
          ...fresh
            .filter(pubkey => !current.some(entry => entry.pubkey === pubkey))
            .map(pubkey => ({ pubkey, channelId })),
        ])
      },
    )
    // Typing pings, everyone's: entries expire client-side after 8s.
    const offTyping = connection.subscribe([{ kinds: [KIND_TYPING] }], event => {
      const parsed = typingFromEvent(event)
      if (!parsed || parsed.pubkey === keypair.publicKey) return
      setTypers(current => ({
        ...current,
        [parsed.channelId]: {
          ...current[parsed.channelId],
          [parsed.pubkey]: Date.now() + 8000,
        },
      }))
    })
    // Every profile on the relay, live: kind:0 broadcasts on change (unlike
    // channel metadata), so names update the moment someone sets one.
    const offProfiles = connection.subscribe([{ kinds: [KIND_PROFILE] }], event => {
      const profile = profileFromEvent(event)
      if (!profile) return
      setNames(current => ({ ...current, [profile.pubkey]: profile.name }))
      if (profile.email)
        setEmails(current => ({ ...current, [profile.pubkey]: profile.email as string }))
    })
    return () => {
      disposed = true
      window.clearInterval(poll)
      offChannels()
      offProfiles()
      offPresence()
      offActivity()
      offTyping()
      offRoster()
      connection.close()
      connectionRef.current = null
    }
  }, [absorbChannelMetadata, refreshChannels, keypair, relayUrl])

  // Messages and their reactions for the active channel: history + live.
  useEffect(() => {
    const connection = connectionRef.current
    if (!connection || !activeChannelId) return undefined
    setMessages([])
    setReactions({})
    setEdits({})
    setDeleted({})
    setHasOlder(false)
    // A full first page means the channel plausibly continues further back.
    let received = 0
    const off = connection.subscribe(
      [
        { kinds: [KIND_STREAM_MESSAGE], '#h': [activeChannelId], limit: 200 },
        { kinds: [KIND_REACTION], '#h': [activeChannelId], limit: 500 },
        { kinds: [KIND_EDIT], '#h': [activeChannelId], limit: 300 },
        { kinds: [KIND_DELETION], '#h': [activeChannelId], limit: 300 },
      ],
      event => {
        if (event.kind === KIND_STREAM_MESSAGE) received += 1
        const edit = editFromEvent(event)
        if (edit) {
          setEdits(current =>
            edit.at >= (current[edit.targetId]?.at ?? 0)
              ? { ...current, [edit.targetId]: { text: edit.text, at: edit.at } }
              : current,
          )
          return
        }
        const removedId = deletionFromEvent(event)
        if (removedId) {
          // A delete may aim at a message — or at a reaction, which is how
          // an unreact arrives. Apply to both stores; ids cannot collide.
          setDeleted(current => ({ ...current, [removedId]: true }))
          setReactions(current => {
            let changed = false
            const next: typeof current = {}
            for (const [targetId, byEmoji] of Object.entries(current)) {
              const kept: Record<string, ReactionEntry[]> = {}
              for (const [emoji, entries] of Object.entries(byEmoji)) {
                const alive = entries.filter(
                  entry => entry.eventId !== removedId,
                )
                if (alive.length !== entries.length) changed = true
                if (alive.length > 0) kept[emoji] = alive
              }
              if (Object.keys(kept).length > 0) next[targetId] = kept
            }
            return changed ? next : current
          })
          return
        }
        const reaction = reactionFromEvent(event)
        if (reaction) {
          setReactions(current => {
            const forTarget = current[reaction.targetId] ?? {}
            const who = forTarget[reaction.emoji] ?? []
            if (who.some(entry => entry.eventId === event.id)) return current
            return {
              ...current,
              [reaction.targetId]: {
                ...forTarget,
                [reaction.emoji]: [
                  ...who,
                  { pubkey: reaction.pubkey, eventId: event.id },
                ],
              },
            }
          })
          return
        }
        const message = messageFromEvent(event)
        if (!message || message.channelId !== activeChannelId) return
        setMessages(current => {
          if (current.some(entry => entry.id === message.id)) return current
          return [...current, message].sort(
            (a, b) => a.createdAt - b.createdAt,
          )
        })
      },
      () => setHasOlder(received >= 200),
    )
    return off
  }, [activeChannelId])

  const searchMessages = useCallback(
    async (query: string): Promise<BuzzMessage[]> => {
      if (!keypair || !activeChannelId || !query.trim()) return []
      const events = await searchChannel(
        keypair,
        relayUrl,
        activeChannelId,
        query.trim(),
      )
      return events
        .map(messageFromEvent)
        .filter(
          (message): message is BuzzMessage =>
            message !== null && message.channelId === activeChannelId,
        )
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    [keypair, relayUrl, activeChannelId],
  )

  const fetchLatest = useCallback(
    (opts: {
      channelId?: string
      authorHex?: string
      limit: number
    }): Promise<BuzzMessage[]> => {
      const connection = connectionRef.current
      if (!connection) return Promise.resolve([])
      const filter: Record<string, unknown> = {
        kinds: [KIND_STREAM_MESSAGE],
        limit: opts.limit,
      }
      if (opts.channelId) filter['#h'] = [opts.channelId]
      if (opts.authorHex) filter.authors = [opts.authorHex]
      return new Promise(resolve => {
        const found: BuzzMessage[] = []
        const off = connection.subscribe(
          [filter],
          event => {
            const message = messageFromEvent(event)
            if (!message) return
            if (opts.channelId && message.channelId !== opts.channelId) return
            found.push(message)
          },
          () => {
            off()
            resolve(found.sort((a, b) => b.createdAt - a.createdAt))
          },
        )
      })
    },
    [],
  )

  const fetchMessages = useCallback(
    (channelId: string, limit = 50): Promise<BuzzMessage[]> => {
      const connection = connectionRef.current
      if (!connection) return Promise.resolve([])
      return new Promise(resolve => {
        const found: BuzzMessage[] = []
        const off = connection.subscribe(
          [{ kinds: [KIND_STREAM_MESSAGE], '#h': [channelId], limit }],
          event => {
            const message = messageFromEvent(event)
            if (message && message.channelId === channelId)
              found.push(message)
          },
          () => {
            off()
            resolve(found.sort((a, b) => a.createdAt - b.createdAt))
          },
        )
      })
    },
    [],
  )

  const searchIn = useCallback(
    async (channelId: string, query: string): Promise<BuzzMessage[]> => {
      if (!keypair || !query.trim()) return []
      const events = await searchChannel(
        keypair,
        relayUrl,
        channelId,
        query.trim(),
      )
      return events
        .map(messageFromEvent)
        .filter(
          (message): message is BuzzMessage =>
            message !== null && message.channelId === channelId,
        )
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    [keypair, relayUrl],
  )

  const searchAll = useCallback(
    async (query: string): Promise<BuzzMessage[]> => {
      if (!keypair || !query.trim()) return []
      const events = await searchChannel(keypair, relayUrl, '', query.trim())
      return events
        .map(messageFromEvent)
        .filter((message): message is BuzzMessage => message !== null)
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    [keypair, relayUrl],
  )

  const sendTo = useCallback(
    async (channelId: string, text: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair || !text.trim()) return 'nothing to send'
      const outcome = await connection.publish(
        buildMessageEvent(keypair, channelId, text.trim()),
      )
      return outcome.accepted ? null : outcome.message || 'relay rejected'
    },
    [keypair],
  )

  const loadOlder = useCallback((): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !activeChannelId) return Promise.resolve()
    const oldest = messagesRef.current[0]
    if (!oldest) return Promise.resolve()
    return new Promise(resolve => {
      let received = 0
      // until is inclusive, so the boundary message comes back too — the
      // id-dedupe absorbs it. A short page means the top has been reached.
      const off = connection.subscribe(
        [
          {
            kinds: [KIND_STREAM_MESSAGE],
            '#h': [activeChannelId],
            until: oldest.createdAt,
            limit: 100,
          },
        ],
        event => {
          received += 1
          const message = messageFromEvent(event)
          if (!message || message.channelId !== activeChannelId) return
          setMessages(current => {
            if (current.some(entry => entry.id === message.id)) return current
            return [...current, message].sort(
              (a, b) => a.createdAt - b.createdAt,
            )
          })
        },
        () => {
          off()
          setHasOlder(received >= 100)
          resolve()
        },
      )
    })
  }, [activeChannelId])

  // Typing entries expire on their own clock; sweep while any exist.
  useEffect(() => {
    const hasAny = Object.values(typers).some(
      byPubkey => Object.keys(byPubkey).length > 0,
    )
    if (!hasAny) return undefined
    const sweep = window.setInterval(() => {
      const now = Date.now()
      setTypers(current => {
        let changed = false
        const next: Record<string, Record<string, number>> = {}
        for (const [channelId, byPubkey] of Object.entries(current)) {
          const alive = Object.fromEntries(
            Object.entries(byPubkey).filter(([, expiry]) => expiry > now),
          )
          if (Object.keys(alive).length !== Object.keys(byPubkey).length)
            changed = true
          if (Object.keys(alive).length > 0) next[channelId] = alive
        }
        return changed ? next : current
      })
    }, 2000)
    return () => {
      window.clearInterval(sweep)
    }
  }, [typers])

  /** Mark a channel read up to now, in state and in persisted settings. */
  const markRead = useCallback((channelId: string) => {
    const now = Math.floor(Date.now() / 1000)
    setLastRead(current => {
      const next = { ...current, [channelId]: now }
      void updateBuzzSettings({ lastRead: next }).catch(() => undefined)
      return next
    })
  }, [])

  useEffect(() => {
    const pending = pendingRestoreRef.current
    if (!pending) return
    if (activeChannelId) {
      pendingRestoreRef.current = null
      return
    }
    if (channels.some(channel => channel.id === pending)) {
      pendingRestoreRef.current = null
      setActiveChannelId(pending)
    }
  }, [channels, activeChannelId])

  const toggleMute = useCallback((channelId: string) => {
    setMuted(current => {
      const next = new Set(current)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      void updateBuzzSettings({ muted: [...next] }).catch(() => undefined)
      return next
    })
  }, [])

  const hideDm = useCallback((channelId: string) => {
    setHiddenDms(current => {
      const next = new Set(current)
      next.add(channelId)
      void updateBuzzSettings({ hiddenDms: [...next] }).catch(() => undefined)
      return next
    })
    setActiveChannelId(current => (current === channelId ? null : current))
  }, [])

  const selectChannel = useCallback(
    (id: string) => {
      // The channel being LEFT was watched until this moment; the one being
      // opened is read the moment it renders. Mark both, or a visited
      // channel shows unread the instant you look away.
      setActiveChannelId(current => {
        if (current) markRead(current)
        return id
      })
      markRead(id)
      void updateBuzzSettings({ lastChannel: id }).catch(() => undefined)
      const connection = connectionRef.current
      // Open channels accept join requests idempotently; joining on first
      // open keeps membership true without a separate join surface.
      if (connection && keypair && !joinedRef.current.has(id)) {
        joinedRef.current.add(id)
        void connection.publish(buildJoinRequestEvent(keypair, id))
      }
    },
    [keypair, markRead],
  )

  /** Throttled "I am typing" ping; fire-and-forget, the relay fans it out. */
  const notifyTyping = useCallback(() => {
    const connection = connectionRef.current
    if (!connection || !keypair || !activeChannelId) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < 3000) return
    lastTypingSentRef.current = now
    connection.emit(buildTypingEvent(keypair, activeChannelId))
  }, [keypair, activeChannelId])

  const sendReaction = useCallback(
    async (targetId: string, emoji: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      // Toggle: reacting again with the same emoji takes the reaction back
      // (a NIP-09 delete of the reaction event; the echo updates state).
      const mine = reactions[targetId]?.[emoji]?.find(
        entry => entry.pubkey === keypair.publicKey,
      )
      const event = mine
        ? buildDeleteEvent(keypair, mine.eventId)
        : buildReactionEvent(keypair, targetId, emoji)
      const outcome = await connection.publish(event)
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      // Apply our own accepted action immediately — the UI must not depend
      // on the relay echoing our event back to our own subscription.
      setReactions(current => {
        const forTarget = { ...(current[targetId] ?? {}) }
        if (mine) {
          const alive = (forTarget[emoji] ?? []).filter(
            entry => entry.eventId !== mine.eventId,
          )
          if (alive.length > 0) forTarget[emoji] = alive
          else delete forTarget[emoji]
        } else {
          const who = forTarget[emoji] ?? []
          if (!who.some(entry => entry.eventId === event.id)) {
            forTarget[emoji] = [
              ...who,
              { pubkey: keypair.publicKey, eventId: event.id },
            ]
          }
        }
        return { ...current, [targetId]: forTarget }
      })
      return null
    },
    [keypair, reactions],
  )

  const sendEdit = useCallback(
    async (targetId: string, text: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair || !activeChannelId || !text.trim())
        return 'nothing to save'
      const outcome = await connection.publish(
        buildEditEvent(keypair, activeChannelId, targetId, text.trim()),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      const at = Math.floor(Date.now() / 1000)
      setEdits(current =>
        at >= (current[targetId]?.at ?? 0)
          ? { ...current, [targetId]: { text: text.trim(), at } }
          : current,
      )
      return null
    },
    [keypair, activeChannelId],
  )

  const sendDelete = useCallback(
    async (targetId: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const outcome = await connection.publish(
        buildDeleteEvent(keypair, targetId),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      setDeleted(current => ({ ...current, [targetId]: true }))
      return null
    },
    [keypair],
  )

  // A channel is unread when something happened after the user last saw it;
  // the value is how many messages that is (capped by the retained window).
  const unread = useMemo(() => {
    const result: Record<string, number> = {}
    for (const [channelId, times] of Object.entries(activityTimes)) {
      if (channelId === activeChannelId || muted.has(channelId)) continue
      const count = times.filter(at => at > (lastRead[channelId] ?? 0)).length
      if (count > 0) result[channelId] = count
    }
    return result
  }, [activityTimes, lastRead, activeChannelId, muted])

  const sendMessage = useCallback(
    async (
      text: string,
      replyTo?: { parentId: string; rootId: string | null },
      mentions?: string[],
    ): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair || !activeChannelId || !text.trim())
        return null
      const event = buildMessageEvent(
        keypair,
        activeChannelId,
        text.trim(),
        [
          ...(replyTo ? buildReplyTags(replyTo.parentId, replyTo.rootId) : []),
          ...mentionTags(mentions ?? []),
        ],
      )
      const outcome = await connection.publish(event)
      return outcome.accepted ? null : outcome.message || 'relay rejected'
    },
    [activeChannelId, keypair],
  )

  const sendFile = useCallback(
    async (
      file: File,
      text = '',
      targetChannelId?: string,
    ): Promise<string | null> => {
      const connection = connectionRef.current
      const channelId = targetChannelId ?? activeChannelId
      if (!connection || !keypair || !channelId) return 'no channel open'
      try {
        const blob = await uploadFile(keypair, relayUrl, file)
        // Mirror the buzz desktop's shape: markdown image line in the
        // content, NIP-92 imeta tag on the event — either client renders it.
        // blob.name, not file.name: sanitizing may have re-encoded to PNG.
        // Typed text and the attachment travel as ONE message.
        const content = [text.trim(), `![${blob.name}](${blob.url})`]
          .filter(Boolean)
          .join('\n\n')
        const event = buildMessageEvent(keypair, channelId, content, [
          imetaTag(blob),
        ])
        const outcome = await connection.publish(event)
        return outcome.accepted ? null : outcome.message || 'relay rejected'
      } catch (error) {
        return error instanceof Error ? error.message : 'upload failed'
      }
    },
    [activeChannelId, keypair, relayUrl],
  )

  // url → in-flight or settled data: URL. Blobs are immutable (content-
  // addressed), so entries never expire; failures evict so a retry can work.
  const mediaCacheRef = useRef<Map<string, Promise<string>>>(new Map())
  const resolveMedia = useCallback(
    (url: string): Promise<string> => {
      if (!keypair) return Promise.reject(new Error('still starting up'))
      const cache = mediaCacheRef.current
      let promise = cache.get(url)
      if (!promise) {
        promise = fetchMediaAsDataUrl(keypair, url)
        promise.catch(() => cache.delete(url))
        cache.set(url, promise)
      }
      return promise
    },
    [keypair],
  )

  // Announce ourselves online once authed, and keep the 180s Redis TTL fed.
  useEffect(() => {
    if (status !== 'ready' || !keypair) return undefined
    const beat = (): void => {
      void connectionRef.current?.publish(buildPresenceEvent(keypair))
    }
    beat()
    const timer = window.setInterval(beat, 120_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [status, keypair])

  // Live deltas only arrive while we watch, so seed the active channel's
  // roster with a queried snapshot of who is online right now.
  useEffect(() => {
    if (status !== 'ready' || !keypair || !activeChannelId) return undefined
    const roster = channelMembers[activeChannelId]
    if (!roster?.length) return undefined
    let cancelled = false
    void queryPresence(
      keypair,
      relayUrl,
      roster.map(member => member.pubkey),
    ).then(snapshot => {
      if (cancelled) return
      // The relay only names the online; everyone else in the roster is not.
      setPresence(current => {
        const next = { ...current }
        for (const member of roster) next[member.pubkey] = false
        return { ...next, ...snapshot }
      })
    })
    return () => {
      cancelled = true
    }
  }, [status, keypair, relayUrl, activeChannelId, channelMembers])

  const createChannel = useCallback(
    async (
      name: string,
      visibility: 'open' | 'private' = 'open',
    ): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair || !name.trim()) return null
      const event = buildCreateChannelEvent(keypair, name.trim(), {
        visibility,
      })
      const outcome = await connection.publish(event)
      if (outcome.accepted) refreshChannels()
      return outcome.accepted ? null : outcome.message || 'relay rejected'
    },
    [keypair, refreshChannels],
  )

  const addToChannel = useCallback(
    async (channelId: string, pubkeyInput: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const pubkey = parsePubkey(pubkeyInput)
      if (!pubkey) return 'not a key — paste an npub or 64-char hex'
      const outcome = await connection.publish(
        buildPutUserEvent(keypair, channelId, pubkey),
      )
      return outcome.accepted ? null : outcome.message || 'relay rejected'
    },
    [keypair],
  )

  /** A person as humans name them: display name (unique), npub, or hex. */
  const resolvePersonInput = useCallback(
    (input: string): { pubkey: string } | { error: string } => {
      const raw = input.trim()
      if (!raw) return { error: 'who? a name, npub, or hex key' }
      const asKey = parsePubkey(raw)
      if (asKey) return { pubkey: asKey }
      const needle = raw.toLowerCase()
      const matches = Object.entries(names).filter(
        ([, name]) => name.toLowerCase() === needle,
      )
      if (matches.length === 1) return { pubkey: matches[0][0] }
      if (matches.length > 1)
        return {
          error: `"${raw}" is ambiguous — use their key (hover their avatar)`,
        }
      return {
        error: `nobody called "${raw}" here — a key also works`,
      }
    },
    [names],
  )

  const openDm = useCallback(
    async (pubkeyInput: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const resolved = resolvePersonInput(pubkeyInput)
      if ('error' in resolved) return resolved.error
      const pubkey = resolved.pubkey
      if (pubkey === keypair.publicKey) return 'that is your own key'
      const outcome = await connection.publish(
        buildDmOpenEvent(keypair, [pubkey]),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      // The relay creates (or reuses) the hidden channel and re-publishes
      // discovery; the refresh pulls it into the sidebar.
      refreshChannels()
      return null
    },
    [keypair, refreshChannels, resolvePersonInput],
  )

  const createInvite = useCallback(
    async (ttlSecs?: number): Promise<MintedInvite> => {
    if (!keypair) throw new Error('still starting up')
    const invite = await mintInvite(keypair, relayUrl, ttlSecs)
    // Remember where this invite came from: when its claimer appears on the
    // relay roster, we offer to add them to this channel.
    if (activeChannelId) {
      pendingInvitesRef.current.push({
        channelId: activeChannelId,
        at: Date.now(),
      })
    }
    return invite
    },
    [keypair, relayUrl, activeChannelId],
  )

  const resolveJoinPrompt = useCallback(
    async (pubkey: string, add: boolean): Promise<string | null> => {
      const prompt = joinPrompts.find(entry => entry.pubkey === pubkey)
      setJoinPrompts(current =>
        current.filter(entry => entry.pubkey !== pubkey),
      )
      if (!add || !prompt) return null
      return addToChannel(prompt.channelId, pubkey)
    },
    [joinPrompts, addToChannel],
  )

  const exportIdentity = useCallback(
    (): string | null => (keypair ? nsecOf(keypair.secretKey) : null),
    [keypair],
  )

  const importIdentity = useCallback(
    async (input: string): Promise<string | null> => {
      const secretHex = parseSecret(input)
      if (!secretHex) return 'not a secret key — paste an nsec or 64-char hex'
      let pair: BuzzKeypair
      try {
        pair = keypairFromSecret(secretHex)
      } catch {
        return 'that secret does not decode to a valid key'
      }
      // Store first: an identity that only ever lived in React state would
      // silently vanish at the next launch — the exact bug PR #1 killed.
      try {
        await storeSecretKey(secretHex)
      } catch (error) {
        return error instanceof Error
          ? error.message
          : 'the key could not be stored'
      }
      joinedRef.current = new Set()
      setKeyStorage({ kind: 'stored' })
      setKeypair(pair)
      return null
    },
    [],
  )

  const setDisplayName = useCallback(
    async (name: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair || !name.trim()) return null
      const outcome = await connection.publish(buildProfileEvent(keypair, name))
      // The relay echoes our own kind:0 back on the live subscription, so the
      // name map updates without a separate local write.
      return outcome.accepted ? null : outcome.message || 'relay rejected'
    },
    [keypair],
  )

  const nameFor = useCallback(
    (pubkey: string): string => names[pubkey] ?? shortPubkey(pubkey),
    [names],
  )

  const renameChannel = useCallback(
    async (channelId: string, name: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair || !name.trim()) return null
      const outcome = await connection.publish(
        buildEditMetadataEvent(keypair, channelId, { name }),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      // The relay re-emits 39000; the poll would catch it, but be prompt.
      setChannels(current =>
        current.map(channel =>
          channel.id === channelId
            ? { ...channel, name: name.trim() }
            : channel,
        ),
      )
      refreshChannels()
      return null
    },
    [keypair, refreshChannels],
  )

  const leaveChannel = useCallback(
    async (channelId: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const outcome = await connection.publish(
        buildLeaveEvent(keypair, channelId),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      joinedRef.current.delete(channelId)
      setChannels(current =>
        current.filter(channel => channel.id !== channelId),
      )
      setActiveChannelId(current => (current === channelId ? null : current))
      return null
    },
    [keypair],
  )

  const removeFromChannel = useCallback(
    async (channelId: string, pubkey: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const outcome = await connection.publish(
        buildRemoveUserEvent(keypair, channelId, pubkey),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      setChannelMembers(current => ({
        ...current,
        [channelId]: (current[channelId] ?? []).filter(
          member => member.pubkey !== pubkey,
        ),
      }))
      return null
    },
    [keypair],
  )

  const deleteChannel = useCallback(
    async (channelId: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const outcome = await connection.publish(
        buildDeleteGroupEvent(keypair, channelId),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      joinedRef.current.delete(channelId)
      setChannels(current =>
        current.filter(channel => channel.id !== channelId),
      )
      setActiveChannelId(current => (current === channelId ? null : current))
      return null
    },
    [keypair],
  )

  const makeChannelPrivate = useCallback(
    async (channelId: string): Promise<string | null> => {
      const connection = connectionRef.current
      if (!connection || !keypair) return 'still starting up'
      const outcome = await connection.publish(
        buildEditMetadataEvent(keypair, channelId, { visibility: 'private' }),
      )
      if (!outcome.accepted) return outcome.message || 'relay rejected'
      setChannels(current =>
        current.map(channel =>
          channel.id === channelId
            ? { ...channel, visibility: 'private' as const }
            : channel,
        ),
      )
      return null
    },
    [keypair],
  )

  const setRelayUrl = useCallback((url: string) => {
    const trimmed = normalizeRelayUrl(url)
    if (!trimmed) return
    if (!isValidRelayUrl(trimmed)) {
      // Refuse to save what could never connect; say why in the status bar.
      setStatus('closed')
      setStatusDetail('relay URL must start with ws:// or wss://')
      return
    }
    void updateBuzzSettings({ relayUrl: trimmed }).catch(() => undefined)
    setChannels([])
    setActiveChannelId(null)
    setRelayUrlState(trimmed)
  }, [])

  const performClaim = useCallback(
    async (
      code: string,
      channelId: string | null,
      identity?: { name: string; email: string },
    ): Promise<string | null> => {
      if (!keypair) return 'still starting up'
      const result = await claimInvite(keypair, relayUrl, code)
      if (!result.ok) return result.detail ?? result.status
      // Introduce yourself the moment you are in: the kind:0 lands right
      // behind the claim, so the inviter's join prompt shows a person, not
      // a bare key. Applied locally at once (their own name must not flash
      // as a hex key while the echo travels), and a refused publish is a
      // surfaced error, not a silent stranding.
      if (identity?.name.trim()) {
        setNames(current => ({
          ...current,
          [keypair.publicKey]: identity.name.trim(),
        }))
        if (identity.email.trim())
          setEmails(current => ({
            ...current,
            [keypair.publicKey]: identity.email.trim(),
          }))
        const profileOutcome = await connectionRef.current?.publish(
          buildProfileEvent(keypair, identity.name, identity.email),
        )
        if (profileOutcome && !profileOutcome.accepted) {
          return `joined, but your name was not saved: ${
            profileOutcome.message || 'relay rejected the profile'
          } — set it again in the bottom-right field`
        }
      }
      // A channel-carrying invite finishes the journey for legacy open
      // channels: claiming only joins the relay, so self-join the channel.
      if (channelId) {
        const outcome = await connectionRef.current?.publish(
          buildJoinRequestEvent(keypair, channelId),
        )
        if (outcome && !outcome.accepted) {
          refreshChannels()
          return `joined the relay, but not the channel: ${outcome.message || 'rejected'}`
        }
      }
      refreshChannels()
      return null
    },
    [keypair, refreshChannels, relayUrl],
  )

  // A packed invite may point at a DIFFERENT relay: the claim then has to
  // wait for the new connection to authenticate before it can run.
  const pendingJoinRef = useRef<{
    code: string
    channelId: string | null
    identity?: { name: string; email: string }
    onDone: (error: string | null) => void
  } | null>(null)

  useEffect(() => {
    if (status !== 'ready') return
    const pending = pendingJoinRef.current
    if (!pending) return
    pendingJoinRef.current = null
    void performClaim(pending.code, pending.channelId, pending.identity).then(
      pending.onDone,
    )
  }, [status, performClaim])

  const joinWithInvite = useCallback(
    async (
      input: string,
      identity?: { name: string; email: string },
    ): Promise<string | null> => {
      if (!keypair) return 'still starting up'
      let bundle: ReturnType<typeof parseInviteInput>
      try {
        bundle = parseInviteInput(input)
      } catch (error) {
        return error instanceof Error ? error.message : 'unreadable invite'
      }
      if (bundle.relay && bundle.relay !== relayUrl) {
        if (!isValidRelayUrl(normalizeRelayUrl(bundle.relay)))
          return 'the invite names an invalid relay'
        // One paste configures everything: point at the invite's relay and
        // finish the claim when that connection comes ready.
        return new Promise(resolve => {
          pendingJoinRef.current = {
            code: bundle.code,
            channelId: bundle.channelId,
            identity,
            onDone: resolve,
          }
          setRelayUrl(normalizeRelayUrl(bundle.relay))
        })
      }
      return performClaim(bundle.code, bundle.channelId, identity)
    },
    [keypair, relayUrl, performClaim, setRelayUrl],
  )


  return {
    status,
    statusDetail,
    keyStorage,
    relayUrl,
    publicKey: keypair?.publicKey ?? '',
    displayName: keypair ? names[keypair.publicKey] ?? '' : '',
    names,
    emails,
    nameFor,
    setDisplayName,
    channels,
    activeChannelId,
    messages,
    hasOlder,
    loadOlder,
    searchMessages,
    fetchMessages,
    fetchLatest,
    searchIn,
    searchAll,
    sendTo,
    channelMembers,
    presence,
    unread,
    markRead,
    muted,
    toggleMute,
    hiddenDms,
    hideDm,
    linkPreviews,
    typers,
    reactions,
    edits,
    deleted,
    notifyTyping,
    sendReaction,
    sendEdit,
    sendDelete,
    selectChannel,
    sendMessage,
    sendFile,
    resolveMedia,
    createChannel,
    addToChannel,
    renameChannel,
    leaveChannel,
    removeFromChannel,
    deleteChannel,
    makeChannelPrivate,
    setRelayUrl,
    joinWithInvite,
    createInvite,
    joinPrompts,
    resolveJoinPrompt,
    openDm,
    exportIdentity,
    importIdentity,
  }
}
