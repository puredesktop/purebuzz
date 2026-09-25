import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure'
import { generateSecretKey } from 'nostr-tools/pure'
import { npubEncode, nsecEncode, decode as nip19Decode } from 'nostr-tools/nip19'

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error('invalid hex')
    bytes[i] = byte
  }
  return bytes
}

/**
 * The slice of Buzz's protocol this pilot speaks.
 *
 * Buzz is Nostr underneath: every action is a signed event, and the kind
 * integer is the dispatch mechanism. These constants and builders mirror
 * block/buzz's crates/buzz-core/src/kind.rs and its relay handlers — the
 * source of truth when the two disagree:
 *
 * - auth is NIP-42: the relay sends ["AUTH", challenge], the client answers
 *   with a signed kind:22242 carrying relay + challenge tags
 * - a chat message is kind:9 with an ["h", channelId] tag (NIP-29 shape)
 * - a channel is created by kind:9007 with name/visibility/channel_type tags;
 *   joining is kind:9021
 * - channel state is published by the relay as NIP-29 kind:39000 metadata
 */

export const KIND_AUTH = 22242
export const KIND_STREAM_MESSAGE = 9
export const KIND_CREATE_GROUP = 9007
export const KIND_JOIN_REQUEST = 9021
export const KIND_PUT_USER = 9000
export const KIND_GROUP_METADATA = 39000

export interface BuzzKeypair {
  /** hex secret key — stored only in the user's workspace */
  secretKey: string
  /** hex public key — the identity everything is signed with */
  publicKey: string
}

export interface SignedEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export function generateKeypair(): BuzzKeypair {
  const secret = generateSecretKey()
  return {
    secretKey: bytesToHex(secret),
    publicKey: getPublicKey(secret),
  }
}

export function keypairFromSecret(secretHex: string): BuzzKeypair {
  const secret = hexToBytes(secretHex)
  return { secretKey: secretHex, publicKey: getPublicKey(secret) }
}

function sign(
  keypair: BuzzKeypair,
  kind: number,
  tags: string[][],
  content: string,
): SignedEvent {
  return finalizeEvent(
    {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    },
    hexToBytes(keypair.secretKey),
  ) as SignedEvent
}

/** NIP-42 response to the relay's ["AUTH", challenge]. Never stored. */
export function buildAuthEvent(
  keypair: BuzzKeypair,
  relayUrl: string,
  challenge: string,
): SignedEvent {
  return sign(
    keypair,
    KIND_AUTH,
    [
      ['relay', relayUrl],
      ['challenge', challenge],
    ],
    '',
  )
}

export function buildMessageEvent(
  keypair: BuzzKeypair,
  channelId: string,
  text: string,
  extraTags: string[][] = [],
): SignedEvent {
  return sign(
    keypair,
    KIND_STREAM_MESSAGE,
    [['h', channelId], ...extraTags],
    text,
  )
}

/** NIP-92 imeta tag for an uploaded attachment. */
export function imetaTag(blob: {
  url: string
  mime: string
  sha256: string
  size: number
}): string[] {
  return [
    'imeta',
    `url ${blob.url}`,
    `m ${blob.mime}`,
    `x ${blob.sha256}`,
    `size ${blob.size}`,
  ]
}

export function buildCreateChannelEvent(
  keypair: BuzzKeypair,
  name: string,
  options: { about?: string; visibility?: 'open' | 'private' } = {},
): SignedEvent {
  const tags: string[][] = [
    ['name', name],
    ['visibility', options.visibility ?? 'open'],
    ['channel_type', 'stream'],
  ]
  if (options.about?.trim()) tags.push(['about', options.about.trim()])
  return sign(keypair, KIND_CREATE_GROUP, tags, '')
}

export function buildJoinRequestEvent(
  keypair: BuzzKeypair,
  channelId: string,
): SignedEvent {
  return sign(keypair, KIND_JOIN_REQUEST, [['h', channelId]], '')
}

/**
 * NIP-29 put-user: add a pubkey to a channel. Private channels only accept
 * this from an existing member — self-join (9021) is rejected there, so this
 * is how anyone gets into one. No role tag: an ordinary member is added.
 */
export function buildPutUserEvent(
  keypair: BuzzKeypair,
  channelId: string,
  memberPubkeyHex: string,
): SignedEvent {
  return sign(
    keypair,
    KIND_PUT_USER,
    [
      ['h', channelId],
      ['p', memberPubkeyHex],
    ],
    '',
  )
}

/**
 * Accept an identity as pasted — bech32 npub or 64-char hex — and return the
 * hex pubkey, or null when it is neither.
 */
export function parsePubkey(input: string): string | null {
  const trimmed = input.trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (trimmed.startsWith('npub1')) {
    try {
      const decoded = nip19Decode(trimmed)
      if (decoded.type === 'npub') return decoded.data
    } catch {
      return null
    }
  }
  return null
}

export function verify(event: SignedEvent): boolean {
  return verifyEvent(event)
}

/** The ["h", …] tag names the channel an event belongs to. */
export function channelIdOf(event: SignedEvent): string | null {
  const tag = event.tags.find(entry => entry[0] === 'h' && entry[1])
  return tag?.[1] ?? null
}

export function tagValue(event: SignedEvent, name: string): string | null {
  const tag = event.tags.find(entry => entry[0] === name && entry[1])
  return tag?.[1] ?? null
}

export interface BuzzChannel {
  id: string
  name: string
  about: string | null
  /** From the bare ["private"]/["public"] tag on kind:39000. */
  visibility: 'open' | 'private'
  /** DMs are hidden channels; the relay marks their 39000 with ["hidden"]. */
  type: 'channel' | 'dm'
  /** DM participants (p tags on the 39000); empty for regular channels. */
  participants: string[]
}

export const KIND_DM_OPEN = 41010

/**
 * Open (or reuse) a direct-message conversation with 1–8 other people. The
 * relay creates a hidden channel and publishes its discovery events; there
 * is nothing channel-like to name — identity IS the address.
 */
export function buildDmOpenEvent(
  keypair: BuzzKeypair,
  otherPubkeysHex: string[],
): SignedEvent {
  return sign(
    keypair,
    KIND_DM_OPEN,
    otherPubkeysHex.map(pubkey => ['p', pubkey]),
    '',
  )
}

/**
 * A channel as described by the relay's NIP-29 kind:39000 metadata. The
 * addressable d-tag carries the channel id.
 */
export function channelFromMetadata(event: SignedEvent): BuzzChannel | null {
  if (event.kind !== KIND_GROUP_METADATA) return null
  const id = tagValue(event, 'd')
  if (!id) return null
  const hidden = event.tags.some(entry => entry[0] === 'hidden')
  return {
    id,
    name: tagValue(event, 'name') ?? id,
    about: tagValue(event, 'about'),
    // The tags are bare (no value), so presence is the whole signal.
    visibility: event.tags.some(entry => entry[0] === 'private')
      ? 'private'
      : 'open',
    type: hidden ? 'dm' : 'channel',
    participants: hidden
      ? event.tags
          .filter(entry => entry[0] === 'p' && entry[1])
          .map(entry => entry[1])
      : [],
  }
}

export interface MessageMedia {
  url: string
  mime: string
}

export interface BuzzMessage {
  id: string
  channelId: string
  pubkey: string
  createdAt: number
  text: string
  /** Attachments from NIP-92 imeta tags. */
  media: MessageMedia[]
  /** The message this replies to, when it is a reply. */
  parentId: string | null
  /** The thread root (equals parentId for a first-level reply). */
  rootId: string | null
  /** Mentioned pubkeys — the buzz convention's p tags on kind:9. */
  mentions: string[]
}

/** Mention tags, buzz's convention: one ["p", pubkey] per mentioned member. */
export function mentionTags(pubkeys: string[]): string[][] {
  return [...new Set(pubkeys)].map(pubkey => ['p', pubkey])
}

/**
 * Thread reference tags, buzz's dialect of NIP-10: the root is marked
 * "root", the direct parent "reply"; a first-level reply carries only the
 * reply marker (parent IS the root).
 */
export function buildReplyTags(
  parentId: string,
  rootId: string | null,
): string[][] {
  if (!rootId || rootId === parentId) return [['e', parentId, '', 'reply']]
  return [
    ['e', rootId, '', 'root'],
    ['e', parentId, '', 'reply'],
  ]
}

function threadReferenceOf(tags: string[][]): {
  parentId: string | null
  rootId: string | null
} {
  const eTags = tags.filter(tag => tag[0] === 'e' && tag[1])
  if (eTags.length === 0) return { parentId: null, rootId: null }
  const root = eTags.find(tag => tag[3] === 'root')
  const reply = [...eTags].reverse().find(tag => tag[3] === 'reply')
  if (!reply) return { parentId: null, rootId: root?.[1] ?? null }
  return { parentId: reply[1], rootId: root?.[1] ?? reply[1] }
}

/** Parse NIP-92 imeta tags: space-delimited "key value" strings after tag 0. */
function mediaFromTags(tags: string[][]): MessageMedia[] {
  const media: MessageMedia[] = []
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue
    let url = ''
    let mime = ''
    for (const field of tag.slice(1)) {
      const space = field.indexOf(' ')
      if (space <= 0) continue
      const key = field.slice(0, space)
      const value = field.slice(space + 1)
      if (key === 'url') url = value
      if (key === 'm') mime = value
    }
    if (url) media.push({ url, mime: mime || 'application/octet-stream' })
  }
  return media
}

export function messageFromEvent(event: SignedEvent): BuzzMessage | null {
  if (event.kind !== KIND_STREAM_MESSAGE) return null
  const channelId = channelIdOf(event)
  if (!channelId) return null
  const thread = threadReferenceOf(event.tags)
  return {
    id: event.id,
    channelId,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    text: event.content,
    media: mediaFromTags(event.tags),
    parentId: thread.parentId,
    rootId: thread.rootId,
    mentions: event.tags
      .filter(tag => tag[0] === 'p' && tag[1])
      .map(tag => tag[1]),
  }
}

export const KIND_PROFILE = 0
export const KIND_HTTP_AUTH = 27235

export interface BuzzProfile {
  pubkey: string
  name: string
  /** Self-reported email (nip05 field), when the person offered one. */
  email: string | null
}

/**
 * A NIP-01 kind:0 profile: JSON name/display_name in the content, with an
 * optional email carried as nip05 (self-reported — a label, not proof).
 */
export function buildProfileEvent(
  keypair: BuzzKeypair,
  name: string,
  email?: string,
): SignedEvent {
  return sign(
    keypair,
    KIND_PROFILE,
    [],
    JSON.stringify({
      name: name.trim(),
      display_name: name.trim(),
      ...(email?.trim() ? { nip05: email.trim() } : {}),
    }),
  )
}

/** Read a display name from a kind:0 event; null when it carries none. */
export function profileFromEvent(event: SignedEvent): BuzzProfile | null {
  if (event.kind !== KIND_PROFILE) return null
  try {
    const data = JSON.parse(event.content) as Record<string, unknown>
    const name =
      (typeof data.display_name === 'string' && data.display_name.trim()) ||
      (typeof data.name === 'string' && data.name.trim()) ||
      ''
    if (!name) return null
    const email =
      typeof data.nip05 === 'string' && data.nip05.includes('@')
        ? data.nip05.trim()
        : null
    return { pubkey: event.pubkey, name, email }
  } catch {
    return null
  }
}

/**
 * NIP-98 HTTP auth: a short-lived signed event naming the exact URL and
 * method, carried as "Authorization: Nostr <base64(event)>". Buzz requires it
 * on the invite endpoints (and accepts it on the whole REST bridge). When a
 * body is sent, its SHA-256 rides in the payload tag so the request cannot be
 * body-swapped in transit.
 */
export async function buildHttpAuthHeader(
  keypair: BuzzKeypair,
  url: string,
  method: string,
  body?: string,
): Promise<string> {
  const tags: string[][] = [
    ['u', url],
    ['method', method.toUpperCase()],
  ]
  if (body !== undefined) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(body),
    )
    tags.push(['payload', bytesToHex(new Uint8Array(digest))])
  }
  const event = sign(keypair, KIND_HTTP_AUTH, tags, '')
  return `Nostr ${btoa(JSON.stringify(event))}`
}

/**
 * Clean a relay address as typed or pasted: surrounding whitespace and stray
 * wrapping quotes are removed. Quotes ride along with copy-pasted URLs often
 * enough that one ended up saved — and a saved malformed URL used to crash
 * the app at every boot.
 */
export function normalizeRelayUrl(input: string): string {
  return input.trim().replace(/^["']+|["']+$/g, '')
}

/** Only ws:// and wss:// can carry a Nostr relay connection. */
export function isValidRelayUrl(url: string): boolean {
  return /^wss?:\/\/.+/.test(url)
}

/** The relay's HTTP origin: ws://host → http://host, wss:// → https://. */
export function httpOriginOf(relayUrl: string): string {
  return relayUrl.replace(/^ws/, 'http').replace(/\/+$/, '')
}

/** Short display form of a pubkey, until profiles are wired in. */
export function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}…`
}

/**
 * The shareable bech32 form of a hex pubkey. This is what an operator pastes
 * into `buzz-admin add-member` — the whole reason the UI offers a copy.
 */
export function npubOf(pubkeyHex: string): string {
  return npubEncode(pubkeyHex)
}

export const KIND_GROUP_MEMBERS = 39002
export const KIND_PRESENCE = 20001
export const KIND_BLOSSOM_AUTH = 24242

/**
 * Blossom (BUD-11) auth for the relay's media endpoints: a short-lived
 * kind:24242 event carried as "Authorization: Nostr <base64(event)>".
 * The verb rides in t, the blob's sha256 in x, and the relay requires a
 * non-empty content describing the action.
 */
export function buildBlossomAuthHeader(
  keypair: BuzzKeypair,
  verb: 'upload' | 'get',
  sha256: string,
  description: string,
): string {
  const event = sign(
    keypair,
    KIND_BLOSSOM_AUTH,
    [
      ['t', verb],
      ['x', sha256],
      ['expiration', String(Math.floor(Date.now() / 1000) + 300)],
    ],
    description,
  )
  return `Nostr ${btoa(JSON.stringify(event))}`
}

export interface ChannelMember {
  pubkey: string
  role: string
}

/** Ephemeral presence heartbeat; the relay holds it in Redis for 180s. */
export function buildPresenceEvent(
  keypair: BuzzKeypair,
  status: 'online' | 'offline' = 'online',
): SignedEvent {
  return sign(keypair, KIND_PRESENCE, [], status)
}

/**
 * A channel's roster from the relay-signed kind:39002: the d tag names the
 * channel, each ["p", pubkey, relay, role] tag one member.
 */
export function membersFromEvent(
  event: SignedEvent,
): { channelId: string; members: ChannelMember[] } | null {
  if (event.kind !== KIND_GROUP_MEMBERS) return null
  const channelId = tagValue(event, 'd')
  if (!channelId) return null
  const members = event.tags
    .filter(entry => entry[0] === 'p' && entry[1])
    .map(entry => ({ pubkey: entry[1], role: entry[3] || 'member' }))
  return { channelId, members }
}

/**
 * Who a kind:20001 speaks about, and whether they are online. Live deltas are
 * signed by the person themselves; relay-synthesized snapshots are signed by
 * the relay with the subject in a p tag — so the p tag wins when present.
 */
export function presenceFromEvent(
  event: SignedEvent,
): { pubkey: string; online: boolean } | null {
  if (event.kind !== KIND_PRESENCE) return null
  const subject = tagValue(event, 'p') ?? event.pubkey
  return { pubkey: subject, online: event.content !== 'offline' }
}

export const KIND_REACTION = 7
export const KIND_TYPING = 20002

/** Ephemeral "I am typing in this channel" ping; the UI applies its own TTL. */
export function buildTypingEvent(
  keypair: BuzzKeypair,
  channelId: string,
): SignedEvent {
  return sign(keypair, KIND_TYPING, [['h', channelId]], '')
}

export function typingFromEvent(
  event: SignedEvent,
): { channelId: string; pubkey: string } | null {
  if (event.kind !== KIND_TYPING) return null
  const channelId = channelIdOf(event)
  if (!channelId) return null
  return { channelId, pubkey: event.pubkey }
}

/** NIP-25 reaction: the emoji is the content, the target rides in the e tag. */
export function buildReactionEvent(
  keypair: BuzzKeypair,
  targetEventId: string,
  emoji: string,
): SignedEvent {
  return sign(keypair, KIND_REACTION, [['e', targetEventId]], emoji)
}

export interface BuzzReaction {
  targetId: string
  emoji: string
  pubkey: string
}

export function reactionFromEvent(event: SignedEvent): BuzzReaction | null {
  if (event.kind !== KIND_REACTION) return null
  const targetId = tagValue(event, 'e')
  if (!targetId || !event.content) return null
  return { targetId, emoji: event.content, pubkey: event.pubkey }
}

/** The shareable-but-SECRET bech32 form of the private key. Handle with care. */
export function nsecOf(secretHex: string): string {
  return nsecEncode(hexToBytes(secretHex))
}

/**
 * Accept a pasted secret — bech32 nsec or 64-char hex — and return the hex
 * form, or null when it is neither. The mirror of parsePubkey, for restores.
 */
export function parseSecret(input: string): string | null {
  const trimmed = input.trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (trimmed.startsWith('nsec1')) {
    try {
      const decoded = nip19Decode(trimmed)
      if (decoded.type === 'nsec')
        return bytesToHex(decoded.data as Uint8Array)
    } catch {
      return null
    }
  }
  return null
}

export const KIND_EDIT = 40003
export const KIND_DELETION = 5

/** Buzz message edit: full replacement content for the e-tagged target. */
export function buildEditEvent(
  keypair: BuzzKeypair,
  channelId: string,
  targetEventId: string,
  text: string,
): SignedEvent {
  return sign(
    keypair,
    KIND_EDIT,
    [
      ['h', channelId],
      ['e', targetEventId],
    ],
    text,
  )
}

export function editFromEvent(
  event: SignedEvent,
): { targetId: string; text: string; at: number } | null {
  if (event.kind !== KIND_EDIT) return null
  const targetId = tagValue(event, 'e')
  if (!targetId) return null
  return { targetId, text: event.content, at: event.created_at }
}

/** NIP-09 deletion of one's own event — a message, or a reaction to unreact. */
export function buildDeleteEvent(
  keypair: BuzzKeypair,
  targetEventId: string,
): SignedEvent {
  return sign(keypair, KIND_DELETION, [['e', targetEventId]], '')
}

export function deletionFromEvent(event: SignedEvent): string | null {
  if (event.kind !== KIND_DELETION) return null
  return tagValue(event, 'e')
}

export const KIND_EDIT_METADATA = 9002
export const KIND_LEAVE_REQUEST = 9022
export const KIND_REMOVE_USER = 9001

/** NIP-29 edit-metadata: owners/admins rename, re-describe, re-scope. */
export function buildEditMetadataEvent(
  keypair: BuzzKeypair,
  channelId: string,
  patch: {
    name?: string
    about?: string
    visibility?: 'open' | 'private'
    archived?: boolean
  },
): SignedEvent {
  const tags: string[][] = [['h', channelId]]
  if (patch.name?.trim()) tags.push(['name', patch.name.trim()])
  if (patch.about !== undefined) tags.push(['about', patch.about.trim()])
  if (patch.visibility) tags.push(['visibility', patch.visibility])
  if (patch.archived !== undefined)
    tags.push(['archived', String(patch.archived)])
  return sign(keypair, KIND_EDIT_METADATA, tags, '')
}

export const KIND_DELETE_GROUP = 9008

/** NIP-29 delete-group: the channel owner erases the channel for everyone. */
export function buildDeleteGroupEvent(
  keypair: BuzzKeypair,
  channelId: string,
): SignedEvent {
  return sign(keypair, KIND_DELETE_GROUP, [['h', channelId]], '')
}

/** NIP-29 leave request: take yourself out of a channel. */
export function buildLeaveEvent(
  keypair: BuzzKeypair,
  channelId: string,
): SignedEvent {
  return sign(keypair, KIND_LEAVE_REQUEST, [['h', channelId]], '')
}

/** NIP-29 remove-user: owners/admins remove a member from a channel. */
export function buildRemoveUserEvent(
  keypair: BuzzKeypair,
  channelId: string,
  memberPubkeyHex: string,
): SignedEvent {
  return sign(
    keypair,
    KIND_REMOVE_USER,
    [
      ['h', channelId],
      ['p', memberPubkeyHex],
    ],
    '',
  )
}

export const KIND_MEMBERSHIP_LIST = 13534

/**
 * The relay's NIP-43 membership roster: relay-signed, one
 * ["member", pubkey, role] tag per member, re-published on every join or
 * removal. Diffing successive rosters is how a client notices "someone new
 * just claimed an invite".
 */
export function relayRosterFromEvent(event: SignedEvent): string[] | null {
  if (event.kind !== KIND_MEMBERSHIP_LIST) return null
  return event.tags
    .filter(entry => entry[0] === 'member' && entry[1])
    .map(entry => entry[1])
}
