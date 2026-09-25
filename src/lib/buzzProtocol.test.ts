import { describe, expect, it } from 'vitest'
import {
  buildAuthEvent,
  buildHttpAuthHeader,
  httpOriginOf,
  npubOf,
  nsecOf,
  buildEditEvent,
  buildReplyTags,
  mentionTags,
  buildDeleteEvent,
  editFromEvent,
  deletionFromEvent,
  KIND_EDIT,
  KIND_DELETION,
  KIND_MEMBERSHIP_LIST,
  relayRosterFromEvent,
  parseSecret,
  parsePubkey,
  buildPutUserEvent,
  KIND_PUT_USER,
  KIND_GROUP_MEMBERS,
  KIND_PRESENCE,
  membersFromEvent,
  buildPresenceEvent,
  buildBlossomAuthHeader,
  imetaTag,
  presenceFromEvent,
  normalizeRelayUrl,
  isValidRelayUrl,
  buildCreateChannelEvent,
  buildMessageEvent,
  channelFromMetadata,
  buildProfileEvent,
  channelIdOf,
  generateKeypair,
  keypairFromSecret,
  messageFromEvent,
  profileFromEvent,
  verify,
  KIND_AUTH,
  KIND_CREATE_GROUP,
  KIND_STREAM_MESSAGE,
  KIND_GROUP_METADATA,
  KIND_PROFILE,
  type SignedEvent,
} from './buzzProtocol'

describe('identity', () => {
  it('round-trips a keypair through its secret', () => {
    const pair = generateKeypair()

    const restored = keypairFromSecret(pair.secretKey)

    expect(restored.publicKey).toBe(pair.publicKey)
  })
})

describe('event building', () => {
  const pair = generateKeypair()

  it('signs a NIP-42 auth response the relay can verify', () => {
    const event = buildAuthEvent(pair, 'ws://localhost:3000', 'challenge-123')

    expect(event.kind).toBe(KIND_AUTH)
    expect(event.tags).toContainEqual(['relay', 'ws://localhost:3000'])
    expect(event.tags).toContainEqual(['challenge', 'challenge-123'])
    expect(verify(event)).toBe(true)
  })

  it('tags a message to its channel the way the relay expects', () => {
    // Buzz routes and gates on the ["h", channelId] tag (NIP-29 shape).
    const event = buildMessageEvent(pair, 'chan-1', 'hello hive')

    expect(event.kind).toBe(KIND_STREAM_MESSAGE)
    expect(channelIdOf(event)).toBe('chan-1')
    expect(event.content).toBe('hello hive')
    expect(verify(event)).toBe(true)
  })

  it('creates a channel with the tags handle_create_group requires', () => {
    const event = buildCreateChannelEvent(pair, 'general', {
      about: 'Everything',
    })

    expect(event.kind).toBe(KIND_CREATE_GROUP)
    expect(event.tags).toContainEqual(['name', 'general'])
    expect(event.tags).toContainEqual(['visibility', 'open'])
    expect(event.tags).toContainEqual(['channel_type', 'stream'])
    expect(event.tags).toContainEqual(['about', 'Everything'])
  })
})

describe('parsing relay events', () => {
  it('reads a channel from NIP-29 group metadata', () => {
    const event = {
      id: 'x',
      pubkey: 'p',
      created_at: 1,
      kind: KIND_GROUP_METADATA,
      tags: [
        ['d', 'chan-9'],
        ['name', 'design'],
        ['about', 'Pixels'],
      ],
      content: '',
      sig: 's',
    } as SignedEvent

    expect(channelFromMetadata(event)).toEqual({
      id: 'chan-9',
      name: 'design',
      about: 'Pixels',
      visibility: 'open',
      type: 'channel',
      participants: [],
    })
  })

  it('reads private visibility from the bare tag', () => {
    const event = {
      id: 'x',
      pubkey: 'p',
      created_at: 1,
      kind: KIND_GROUP_METADATA,
      tags: [['d', 'chan-p'], ['name', 'ops'], ['private']],
      content: '',
      sig: 's',
    } as SignedEvent

    expect(channelFromMetadata(event)?.visibility).toBe('private')
  })

  it('ignores metadata without a channel id', () => {
    const event = {
      id: 'x',
      pubkey: 'p',
      created_at: 1,
      kind: KIND_GROUP_METADATA,
      tags: [['name', 'orphan']],
      content: '',
      sig: 's',
    } as SignedEvent

    expect(channelFromMetadata(event)).toBeNull()
  })

  it('reads a message and refuses one without a channel', () => {
    const pair = generateKeypair()
    const good = buildMessageEvent(pair, 'chan-2', 'hi')

    expect(messageFromEvent(good)).toMatchObject({
      channelId: 'chan-2',
      text: 'hi',
      pubkey: pair.publicKey,
    })

    const bare = { ...good, tags: [] }
    expect(messageFromEvent(bare)).toBeNull()
  })
})

describe('NIP-98 http auth', () => {
  it('emits the header shape the relay verifies', async () => {
    // Verified live against block/buzz: mint 200, claim 200 with this shape.
    const pair = generateKeypair()
    const body = '{"code":"abc"}'

    const header = await buildHttpAuthHeader(
      pair,
      'http://localhost:3000/api/invites/claim',
      'post',
      body,
    )

    expect(header.startsWith('Nostr ')).toBe(true)
    const event = JSON.parse(atob(header.slice('Nostr '.length)))
    expect(event.kind).toBe(27235)
    expect(event.tags).toContainEqual([
      'u',
      'http://localhost:3000/api/invites/claim',
    ])
    expect(event.tags).toContainEqual(['method', 'POST'])
    const payload = event.tags.find((t: string[]) => t[0] === 'payload')
    expect(payload?.[1]).toMatch(/^[0-9a-f]{64}$/)
    expect(verify(event)).toBe(true)
  })

  it('omits the payload tag when there is no body', async () => {
    const pair = generateKeypair()

    const header = await buildHttpAuthHeader(pair, 'http://x/api', 'GET')

    const event = JSON.parse(atob(header.slice('Nostr '.length)))
    expect(event.tags.some((t: string[]) => t[0] === 'payload')).toBe(false)
  })
})

describe('httpOriginOf', () => {
  it('maps ws schemes to http schemes', () => {
    expect(httpOriginOf('ws://localhost:3000')).toBe('http://localhost:3000')
    expect(httpOriginOf('wss://team.example.com/')).toBe(
      'https://team.example.com',
    )
  })
})

describe('profiles', () => {
  it('publishes a name as kind:0', () => {
    const pair = generateKeypair()

    const event = buildProfileEvent(pair, '  Ada Lovelace  ')

    expect(event.kind).toBe(KIND_PROFILE)
    const content = JSON.parse(event.content)
    expect(content.name).toBe('Ada Lovelace')
    expect(content.display_name).toBe('Ada Lovelace')
    expect(content.nip05).toBeUndefined()
    expect(verify(event)).toBe(true)
  })

  it('carries a self-reported email as nip05, round-tripping', () => {
    const pair = generateKeypair()
    const event = buildProfileEvent(pair, 'Ada', ' ada@example.com ')
    expect(JSON.parse(event.content).nip05).toBe('ada@example.com')
    expect(profileFromEvent(event)).toEqual({
      pubkey: pair.publicKey,
      name: 'Ada',
      email: 'ada@example.com',
    })
    // A non-email nip05 (real NIP-05 identifiers can be _@domain) is ignored
    // rather than shown as an email.
    const odd = { ...event, content: JSON.stringify({ name: 'x', nip05: 'nope' }) }
    expect(profileFromEvent(odd)?.email).toBeNull()
  })

  it('prefers display_name, falls back to name', () => {
    const base = buildProfileEvent(generateKeypair(), 'x')
    const both = { ...base, content: JSON.stringify({ name: 'n', display_name: 'D' }) }
    const only = { ...base, content: JSON.stringify({ name: 'just-name' }) }

    expect(profileFromEvent(both)?.name).toBe('D')
    expect(profileFromEvent(only)?.name).toBe('just-name')
  })

  it('returns null for an empty or unparseable profile', () => {
    const base = buildProfileEvent(generateKeypair(), 'x')

    expect(profileFromEvent({ ...base, content: '{}' })).toBeNull()
    expect(profileFromEvent({ ...base, content: 'not json' })).toBeNull()
  })
})

describe('npubOf', () => {
  it('encodes a hex pubkey to its bech32 npub', () => {
    // A real device key from the pilot — pins the encoding, not just the shape.
    expect(
      npubOf('528a5c435f80f86b87145157a9ffc14f457ad3dc405944d94febe35fe11f2da4'),
    ).toBe('npub12299cs6lsruxhpc529t6nl7pfazh457ugpv5fk20a034lcgl9kjqtvyflv')
  })

  it('round-trips for a fresh keypair', () => {
    const pair = generateKeypair()
    expect(npubOf(pair.publicKey)).toMatch(/^npub1[a-z0-9]{58}$/)
  })
})

describe('relay url hygiene', () => {
  it('strips pasted quotes and whitespace', () => {
    expect(normalizeRelayUrl(' "wss://relay.example" ')).toBe(
      'wss://relay.example',
    )
    expect(normalizeRelayUrl("'ws://localhost:3000'")).toBe(
      'ws://localhost:3000',
    )
  })

  it('accepts only ws and wss schemes', () => {
    expect(isValidRelayUrl('wss://relay.example')).toBe(true)
    expect(isValidRelayUrl('ws://localhost:3000')).toBe(true)
    // The saved typo that crashed the app at boot.
    expect(isValidRelayUrl('ss://relay.example')).toBe(false)
    expect(isValidRelayUrl('https://relay.example')).toBe(false)
    expect(isValidRelayUrl('')).toBe(false)
  })
})

describe('channel membership', () => {
  it('builds a put-user the relay can verify', () => {
    const pair = generateKeypair()
    const target = generateKeypair().publicKey

    const event = buildPutUserEvent(pair, 'chan-1', target)

    expect(event.kind).toBe(KIND_PUT_USER)
    expect(event.tags).toContainEqual(['h', 'chan-1'])
    expect(event.tags).toContainEqual(['p', target])
    expect(verify(event)).toBe(true)
  })
})

describe('parsePubkey', () => {
  const HEX = '528a5c435f80f86b87145157a9ffc14f457ad3dc405944d94febe35fe11f2da4'
  const NPUB = 'npub12299cs6lsruxhpc529t6nl7pfazh457ugpv5fk20a034lcgl9kjqtvyflv'

  it('accepts hex and npub forms of the same key', () => {
    expect(parsePubkey(HEX)).toBe(HEX)
    expect(parsePubkey(` ${NPUB} `)).toBe(HEX)
    expect(parsePubkey(HEX.toUpperCase())).toBe(HEX)
  })

  it('rejects everything else', () => {
    expect(parsePubkey('adam')).toBeNull()
    expect(parsePubkey('npub1notakey')).toBeNull()
    expect(parsePubkey(`${HEX}ff`)).toBeNull()
    expect(parsePubkey('nsec1p5u9z5lqfrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn')).toBeNull()
  })
})

describe('rosters and presence', () => {
  it('reads a channel roster from relay-signed kind:39002', () => {
    const event = {
      id: 'x', pubkey: 'relay', created_at: 1, kind: KIND_GROUP_MEMBERS,
      tags: [
        ['d', 'chan-1'],
        ['p', 'aa'.repeat(32), '', 'owner'],
        ['p', 'bb'.repeat(32), '', 'member'],
      ],
      content: '', sig: 's',
    } as SignedEvent

    expect(membersFromEvent(event)).toEqual({
      channelId: 'chan-1',
      members: [
        { pubkey: 'aa'.repeat(32), role: 'owner' },
        { pubkey: 'bb'.repeat(32), role: 'member' },
      ],
    })
  })

  it('signs a presence heartbeat', () => {
    const pair = generateKeypair()
    const event = buildPresenceEvent(pair)
    expect(event.kind).toBe(KIND_PRESENCE)
    expect(event.content).toBe('online')
    expect(verify(event)).toBe(true)
  })

  it('prefers the p tag subject on synthesized presence', () => {
    const base = { id: 'x', created_at: 1, kind: KIND_PRESENCE, content: 'online', sig: 's' }
    const synthesized = { ...base, pubkey: 'relay', tags: [['p', 'someone']] } as SignedEvent
    const live = { ...base, pubkey: 'someone', tags: [] } as SignedEvent
    const offline = { ...base, pubkey: 'someone', tags: [], content: 'offline' } as SignedEvent

    expect(presenceFromEvent(synthesized)).toEqual({ pubkey: 'someone', online: true })
    expect(presenceFromEvent(live)).toEqual({ pubkey: 'someone', online: true })
    expect(presenceFromEvent(offline)).toEqual({ pubkey: 'someone', online: false })
  })
})

describe('attachments', () => {
  it('round-trips an attachment through imeta tags', () => {
    const pair = generateKeypair()
    const blob = {
      url: 'https://relay.example/media/' + 'a'.repeat(64) + '.png',
      mime: 'image/png',
      sha256: 'a'.repeat(64),
      size: 1234,
    }
    const event = buildMessageEvent(pair, 'chan-1', '![shot.png](url)', [
      imetaTag(blob),
    ])
    expect(verify(event)).toBe(true)

    const message = messageFromEvent(event)
    expect(message?.media).toEqual([{ url: blob.url, mime: 'image/png' }])
  })

  it('parses no media from a plain message', () => {
    const pair = generateKeypair()
    const message = messageFromEvent(buildMessageEvent(pair, 'chan-1', 'hi'))
    expect(message?.media).toEqual([])
  })

  it('signs a blossom auth header the relay shape expects', () => {
    const pair = generateKeypair()
    const header = buildBlossomAuthHeader(pair, 'upload', 'f'.repeat(64), 'Upload x')
    expect(header.startsWith('Nostr ')).toBe(true)
    const event = JSON.parse(atob(header.slice(6)))
    expect(event.kind).toBe(24242)
    expect(event.content).toBe('Upload x')
    expect(event.tags).toContainEqual(['t', 'upload'])
    expect(event.tags).toContainEqual(['x', 'f'.repeat(64)])
    const exp = event.tags.find((t: string[]) => t[0] === 'expiration')
    expect(Number(exp?.[1])).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(verify(event)).toBe(true)
  })
})

describe('identity backup', () => {
  it('round-trips a secret through nsec encode and parse', () => {
    const pair = generateKeypair()
    const nsec = nsecOf(pair.secretKey)
    expect(nsec).toMatch(/^nsec1[a-z0-9]{58}$/)
    expect(parseSecret(nsec)).toBe(pair.secretKey)
    expect(parseSecret(` ${pair.secretKey.toUpperCase()} `)).toBe(
      pair.secretKey,
    )
  })

  it('rejects non-secrets', () => {
    expect(parseSecret('npub1' + 'q'.repeat(58))).toBeNull()
    expect(parseSecret('hello')).toBeNull()
    expect(parseSecret('')).toBeNull()
  })
})

describe('edits and deletions', () => {
  it('builds and reads an edit', () => {
    const pair = generateKeypair()
    const event = buildEditEvent(pair, 'chan-1', 'msg-id', 'fixed text')
    expect(event.kind).toBe(KIND_EDIT)
    expect(event.tags).toContainEqual(['h', 'chan-1'])
    expect(event.tags).toContainEqual(['e', 'msg-id'])
    expect(verify(event)).toBe(true)
    expect(editFromEvent(event)).toMatchObject({
      targetId: 'msg-id',
      text: 'fixed text',
    })
  })

  it('builds and reads a deletion', () => {
    const pair = generateKeypair()
    const event = buildDeleteEvent(pair, 'msg-id')
    expect(event.kind).toBe(KIND_DELETION)
    expect(deletionFromEvent(event)).toBe('msg-id')
    expect(verify(event)).toBe(true)
  })
})

describe('replies', () => {
  it('builds first-level reply tags without a root marker', () => {
    expect(buildReplyTags('msg-1', null)).toEqual([
      ['e', 'msg-1', '', 'reply'],
    ])
    expect(buildReplyTags('msg-1', 'msg-1')).toEqual([
      ['e', 'msg-1', '', 'reply'],
    ])
  })

  it('round-trips a deep reply through the message parser', () => {
    const pair = generateKeypair()
    const event = buildMessageEvent(
      pair,
      'chan-1',
      'deep',
      buildReplyTags('parent-id', 'root-id'),
    )
    expect(messageFromEvent(event)).toMatchObject({
      parentId: 'parent-id',
      rootId: 'root-id',
    })
  })

  it('treats a first-level reply parent as its own root', () => {
    const pair = generateKeypair()
    const event = buildMessageEvent(
      pair,
      'chan-1',
      'first',
      buildReplyTags('parent-id', null),
    )
    expect(messageFromEvent(event)).toMatchObject({
      parentId: 'parent-id',
      rootId: 'parent-id',
    })
    const plain = messageFromEvent(buildMessageEvent(pair, 'chan-1', 'top'))
    expect(plain).toMatchObject({ parentId: null, rootId: null })
  })
})

describe('relay roster', () => {
  it('reads member pubkeys from a kind:13534 list', () => {
    const event = {
      id: 'x', pubkey: 'relay', created_at: 1, kind: KIND_MEMBERSHIP_LIST,
      tags: [['-'], ['member', 'aa'.repeat(32), 'owner'], ['member', 'bb'.repeat(32), 'member']],
      content: '', sig: 's',
    } as SignedEvent
    expect(relayRosterFromEvent(event)).toEqual(['aa'.repeat(32), 'bb'.repeat(32)])
    expect(relayRosterFromEvent({ ...event, kind: 9 })).toBeNull()
  })
})

describe('mentions', () => {
  it('rides p tags and round-trips through the parser', () => {
    const pair = generateKeypair()
    const target = 'ab'.repeat(32)
    const event = buildMessageEvent(pair, 'chan-1', 'hey @Ada', [
      ...mentionTags([target, target]),
    ])
    expect(event.tags.filter(tag => tag[0] === 'p')).toHaveLength(1)
    expect(messageFromEvent(event)?.mentions).toEqual([target])
    expect(verify(event)).toBe(true)
  })
})
