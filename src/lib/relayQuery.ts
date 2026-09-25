import {
  buildHttpAuthHeader,
  httpOriginOf,
  presenceFromEvent,
  KIND_STREAM_MESSAGE,
  KIND_PRESENCE,
  type BuzzKeypair,
  type SignedEvent,
} from './buzzProtocol'
import { relayHttp } from '../bridge/platformBridge'

/**
 * Current presence for a set of pubkeys, via the relay's HTTP bridge.
 *
 * Ephemeral kind:20001 events are never stored, so a plain REQ finds nothing —
 * but POST /query with kinds:[20001] + authors is intercepted by the relay,
 * which synthesizes the answer from its live Redis presence state. Anyone the
 * relay does not mention is offline; the caller decides how to default them.
 */
export async function queryPresence(
  keypair: BuzzKeypair,
  relayUrl: string,
  pubkeys: string[],
): Promise<Record<string, boolean>> {
  if (pubkeys.length === 0) return {}
  const url = `${httpOriginOf(relayUrl)}/query`
  const body = JSON.stringify([{ kinds: [KIND_PRESENCE], authors: pubkeys }])
  const response = await relayHttp(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: await buildHttpAuthHeader(keypair, url, 'POST', body),
    },
    body,
  })
  if (!response.ok) return {}
  const events = (await response.json().catch(() => [])) as SignedEvent[]
  if (!Array.isArray(events)) return {}
  const presence: Record<string, boolean> = {}
  for (const event of events) {
    const parsed = presenceFromEvent(event)
    if (parsed) presence[parsed.pubkey] = parsed.online
  }
  return presence
}

/**
 * Full-text search within one channel over the HTTP bridge: a NIP-50
 * `search` filter routes to the relay's Postgres FTS. Results come back as
 * plain events, newest first.
 */
export async function searchChannel(
  keypair: BuzzKeypair,
  relayUrl: string,
  channelId: string,
  query: string,
  limit = 50,
): Promise<SignedEvent[]> {
  const url = `${httpOriginOf(relayUrl)}/query`
  const filter: Record<string, unknown> = {
    kinds: [KIND_STREAM_MESSAGE],
    search: query,
    limit,
  }
  // An empty channelId searches every channel the caller can read.
  if (channelId) filter['#h'] = [channelId]
  const body = JSON.stringify([filter])
  const response = await relayHttp(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: await buildHttpAuthHeader(keypair, url, 'POST', body),
    },
    body,
  })
  if (!response.ok) throw new Error(`search failed (${response.status})`)
  const events = (await response.json().catch(() => [])) as SignedEvent[]
  return Array.isArray(events) ? events : []
}
