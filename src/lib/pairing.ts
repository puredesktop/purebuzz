import { secp256k1 } from '@noble/curves/secp256k1.js'
import { getConversationKey } from 'nostr-tools/nip44'
import { v2 as nip44 } from 'nostr-tools/nip44'
import {
  buildAuthEvent,
  generateKeypair,
  httpOriginOf,
  verify,
  type BuzzKeypair,
  type SignedEvent,
} from './buzzProtocol'
import { relayHttp } from '../bridge/platformBridge'
import { finalizeEvent } from 'nostr-tools/pure'

/**
 * NIP-AB device pairing, source side: show a QR, the phone scans it, both
 * screens show the same six digits, and on confirmation the identity
 * (relayUrl + pubkey + nsec) crosses inside NIP-44 ciphertext addressed to
 * throwaway keys. Mirrors buzz's crates/buzz-core/src/pairing — the spec is
 * NIP-AB.md in that directory, and Block's mobile app is the target.
 */

export const KIND_PAIRING = 24134

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    ikm as unknown as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as ArrayBuffer,
      info: new TextEncoder().encode(info) as unknown as ArrayBuffer,
    },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function deriveSessionId(sessionSecret: Uint8Array): Promise<string> {
  return bytesToHex(
    await hkdfSha256(sessionSecret, new Uint8Array(0), 'nostr-pair-session-id', 32),
  )
}

/** Raw ECDH x-coordinate (unhashed), per the spec. */
export function ecdhX(privHex: string, pubHexX: string): Uint8Array {
  const shared = secp256k1.getSharedSecret(
    hexToBytes(privHex),
    hexToBytes(`02${pubHexX}`),
    true,
  )
  return shared.slice(1)
}

export async function deriveSasInput(
  ecdhShared: Uint8Array,
  sessionSecret: Uint8Array,
): Promise<Uint8Array> {
  return hkdfSha256(ecdhShared, sessionSecret, 'nostr-pair-sas-v1', 32)
}

export function sasCodeOf(sasInput: Uint8Array): string {
  const value =
    ((sasInput[0] << 24) | (sasInput[1] << 16) | (sasInput[2] << 8) | sasInput[3]) >>> 0
  return String(value % 1_000_000).padStart(6, '0')
}

export async function deriveTranscriptHash(
  sessionId: string,
  sourcePub: string,
  targetPub: string,
  sasInput: Uint8Array,
  sessionSecret: Uint8Array,
): Promise<string> {
  const transcript = new Uint8Array(128)
  transcript.set(hexToBytes(sessionId), 0)
  transcript.set(hexToBytes(sourcePub), 32)
  transcript.set(hexToBytes(targetPub), 64)
  transcript.set(sasInput, 96)
  return bytesToHex(
    await hkdfSha256(transcript, sessionSecret, 'nostr-pair-transcript-v1', 32),
  )
}

export function buildPairingUri(
  sourcePub: string,
  sessionSecretHex: string,
  relayUrl: string,
): string {
  return `nostrpair://${sourcePub}?secret=${sessionSecretHex}&relay=${encodeURIComponent(relayUrl)}&v=1`
}

/**
 * Where pairing traffic goes, resolved the way Block's desktop resolves it:
 * a NIP-11 `pairing_relay_url`, else the legacy `/pair` path when the relay
 * speaks NIP-43, else the main relay itself.
 */
export async function resolvePairingRelay(relayUrl: string): Promise<string> {
  try {
    const response = await relayHttp(httpOriginOf(relayUrl), {
      headers: { accept: 'application/nostr+json' },
    })
    if (response.ok) {
      const info = (await response.json()) as Record<string, unknown>
      if (
        typeof info.pairing_relay_url === 'string' &&
        /^wss?:\/\//.test(info.pairing_relay_url)
      ) {
        return info.pairing_relay_url
      }
      const nips = Array.isArray(info.supported_nips) ? info.supported_nips : []
      if (nips.includes(43)) return `${relayUrl.replace(/\/+$/, '')}/pair`
    }
  } catch {
    // fall through to the main relay
  }
  return relayUrl
}

export type PairingPhase =
  | { phase: 'qr'; uri: string }
  | { phase: 'sas'; code: string }
  | { phase: 'transferring' }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

interface PairingMessage {
  type: string
  [key: string]: unknown
}

const SESSION_TIMEOUT_MS = 180_000

/**
 * The source-side state machine. Everything here is ephemeral: fresh keys
 * per session, all state discarded at close. The identity payload only
 * leaves after the user confirms the six digits on THIS screen.
 */
export class PairingSourceSession {
  #eph: BuzzKeypair = generateKeypair()
  #secret: Uint8Array = crypto.getRandomValues(new Uint8Array(32))
  #ws: WebSocket | null = null
  #target: string | null = null
  #sasInput: Uint8Array | null = null
  #payload: string
  #relay: string
  #onPhase: (phase: PairingPhase) => void
  #closed = false
  #timer = 0
  #authEventId: string | null = null

  constructor(opts: {
    pairingRelayUrl: string
    /** JSON string {relayUrl, pubkey, nsec} — what the phone imports. */
    payload: string
    onPhase: (phase: PairingPhase) => void
  }) {
    this.#relay = opts.pairingRelayUrl
    this.#payload = opts.payload
    this.#onPhase = opts.onPhase
  }

  get uri(): string {
    return buildPairingUri(this.#eph.publicKey, bytesToHex(this.#secret), this.#relay)
  }

  start(): void {
    this.#onPhase({ phase: 'qr', uri: this.uri })
    let ws: WebSocket
    try {
      ws = new WebSocket(this.#relay)
    } catch (error) {
      this.#fail(error instanceof Error ? error.message : 'bad pairing relay URL')
      return
    }
    this.#ws = ws
    this.#timer = window.setTimeout(
      () => this.#fail('pairing timed out — generate a fresh code'),
      SESSION_TIMEOUT_MS,
    )
    const sendReq = (): void => {
      ws.send(
        JSON.stringify([
          'REQ',
          'pair',
          { kinds: [KIND_PAIRING], '#p': [this.#eph.publicKey] },
        ]),
      )
    }
    // Subscribe immediately for open pair-relays. A NIP-42 relay ignores
    // pre-auth REQs (and does not queue them), so the REQ is re-sent the
    // moment the relay acknowledges our auth event below.
    ws.onopen = sendReq
    ws.onmessage = raw => {
      let frame: unknown[]
      try {
        frame = JSON.parse(String(raw.data)) as unknown[]
      } catch {
        return
      }
      if (!Array.isArray(frame)) return
      if (frame[0] === 'AUTH' && typeof frame[1] === 'string') {
        // Some deployments route pairing through the main relay, which
        // demands NIP-42 — answer with the ephemeral key.
        const auth = buildAuthEvent(this.#eph, this.#relay, frame[1])
        this.#authEventId = auth.id
        ws.send(JSON.stringify(['AUTH', auth]))
        return
      }
      if (
        frame[0] === 'OK' &&
        frame[1] === this.#authEventId &&
        frame[2] === true
      ) {
        // Authed: NOW the subscription will actually be honored.
        sendReq()
        return
      }
      if (frame[0] === 'EVENT' && frame[2]) {
        void this.#handleEvent(frame[2] as SignedEvent)
      }
    }
    ws.onclose = () => {
      if (!this.#closed && this.#target === null) {
        this.#fail('pairing relay closed the connection')
      }
    }
  }

  async #handleEvent(event: SignedEvent): Promise<void> {
    if (this.#closed || event.kind !== KIND_PAIRING) return
    if (!event.tags.some(tag => tag[0] === 'p' && tag[1] === this.#eph.publicKey))
      return
    if (!verify(event)) return
    if (this.#target && event.pubkey !== this.#target) return
    let message: PairingMessage
    try {
      const key = getConversationKey(
        hexToBytes(this.#eph.secretKey),
        event.pubkey,
      )
      message = JSON.parse(nip44.decrypt(event.content, key)) as PairingMessage
    } catch {
      return
    }
    if (message.type === 'offer' && this.#target === null) {
      if (message.version !== 1) return
      const expected = await deriveSessionId(this.#secret)
      if (message.session_id !== expected) return
      this.#target = event.pubkey
      this.#sasInput = await deriveSasInput(
        ecdhX(this.#eph.secretKey, event.pubkey),
        this.#secret,
      )
      this.#onPhase({ phase: 'sas', code: sasCodeOf(this.#sasInput) })
      return
    }
    if (message.type === 'complete') {
      this.#onPhase({ phase: 'done' })
      this.close()
      return
    }
    if (message.type === 'abort') {
      this.#fail(`phone aborted: ${String(message.reason ?? 'unknown')}`)
    }
  }

  /** The user compared the six digits and pressed Confirm. */
  async confirm(): Promise<void> {
    if (!this.#target || !this.#sasInput) return
    this.#onPhase({ phase: 'transferring' })
    const transcriptHash = await deriveTranscriptHash(
      await deriveSessionId(this.#secret),
      this.#eph.publicKey,
      this.#target,
      this.#sasInput,
      this.#secret,
    )
    this.#send({ type: 'sas-confirm', transcript_hash: transcriptHash })
    this.#send({ type: 'payload', payload_type: 'custom', payload: this.#payload })
  }

  deny(): void {
    this.#send({ type: 'abort', reason: 'user_denied' })
    this.#fail('pairing denied')
  }

  #send(message: PairingMessage): void {
    if (!this.#ws || !this.#target) return
    const key = getConversationKey(hexToBytes(this.#eph.secretKey), this.#target)
    const event = finalizeEvent(
      {
        kind: KIND_PAIRING,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', this.#target]],
        content: nip44.encrypt(JSON.stringify(message), key),
      },
      hexToBytes(this.#eph.secretKey),
    )
    this.#ws.send(JSON.stringify(['EVENT', event]))
  }

  #fail(message: string): void {
    if (this.#closed) return
    this.#onPhase({ phase: 'error', message })
    this.close()
  }

  close(): void {
    this.#closed = true
    window.clearTimeout(this.#timer)
    this.#ws?.close()
    this.#ws = null
    this.#sasInput = null
    this.#payload = ''
  }
}
