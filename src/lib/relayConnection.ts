import {
  buildAuthEvent,
  type BuzzKeypair,
  type SignedEvent,
} from './buzzProtocol'

/**
 * One authenticated NIP-01 WebSocket to a Buzz relay.
 *
 * The relay speaks frames: ["AUTH", challenge] on connect, ["EVENT", subId,
 * event] for subscription matches, ["EOSE", subId] when history is drained,
 * ["OK", eventId, accepted, message] for publishes. Buzz fails closed — most
 * REQs return nothing until the NIP-42 handshake completes — so subscriptions
 * made before auth are queued and flushed after the relay accepts us.
 */

export type ConnectionStatus =
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'closed'

interface Subscription {
  filters: Record<string, unknown>[]
  onEvent: (event: SignedEvent) => void
  onEose?: () => void
  sent: boolean
}

export interface RelayConnectionOptions {
  url: string
  keypair: BuzzKeypair
  onStatus?: (status: ConnectionStatus, detail?: string) => void
}

export class RelayConnection {
  #ws: WebSocket | null = null
  #options: RelayConnectionOptions
  #subs = new Map<string, Subscription>()
  #pendingOk = new Map<
    string,
    { resolve: (ok: { accepted: boolean; message: string }) => void }
  >()
  #nextSub = 1
  #authed = false
  #closedByUser = false
  #retryDelay = 1000

  constructor(options: RelayConnectionOptions) {
    this.#options = options
    this.#open()
  }

  #open(): void {
    this.#options.onStatus?.('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.#options.url)
    } catch (error) {
      // The constructor throws on a malformed URL. That must read as a bad
      // address in the status bar — a saved typo used to crash the whole app
      // at every boot, before anything rendered.
      this.#options.onStatus?.(
        'closed',
        error instanceof Error ? error.message : 'invalid relay URL',
      )
      return
    }
    this.#ws = ws
    ws.onopen = () => {
      // Buzz sends AUTH immediately; nothing to do until the challenge lands.
      this.#options.onStatus?.('authenticating')
    }
    ws.onmessage = raw => {
      let frame: unknown[]
      try {
        frame = JSON.parse(String(raw.data))
      } catch {
        return
      }
      if (!Array.isArray(frame)) return
      void this.#handleFrame(frame)
    }
    ws.onclose = () => {
      this.#authed = false
      for (const sub of this.#subs.values()) sub.sent = false
      this.#options.onStatus?.('closed')
      if (!this.#closedByUser) {
        // Reconnect with backoff; subscriptions replay after re-auth.
        window.setTimeout(() => this.#open(), this.#retryDelay)
        this.#retryDelay = Math.min(this.#retryDelay * 2, 15000)
      }
    }
  }

  async #handleFrame(frame: unknown[]): Promise<void> {
    const [type] = frame
    if (type === 'AUTH' && typeof frame[1] === 'string') {
      const auth = buildAuthEvent(
        this.#options.keypair,
        this.#options.url,
        frame[1],
      )
      this.#send(['AUTH', auth])
      // The relay answers the auth event with OK; treat that as ready.
      const outcome = await this.#awaitOk(auth.id)
      if (outcome.accepted) {
        this.#authed = true
        this.#retryDelay = 1000
        this.#options.onStatus?.('ready')
        this.#flushSubscriptions()
      } else {
        this.#options.onStatus?.('closed', outcome.message)
      }
      return
    }
    if (type === 'EVENT' && typeof frame[1] === 'string') {
      const sub = this.#subs.get(frame[1])
      if (sub) sub.onEvent(frame[2] as SignedEvent)
      return
    }
    if (type === 'EOSE' && typeof frame[1] === 'string') {
      this.#subs.get(frame[1])?.onEose?.()
      return
    }
    if (type === 'OK' && typeof frame[1] === 'string') {
      const pending = this.#pendingOk.get(frame[1])
      if (pending) {
        this.#pendingOk.delete(frame[1])
        pending.resolve({
          accepted: frame[2] === true,
          message: typeof frame[3] === 'string' ? frame[3] : '',
        })
      }
    }
  }

  #awaitOk(eventId: string): Promise<{ accepted: boolean; message: string }> {
    return new Promise(resolve => {
      this.#pendingOk.set(eventId, { resolve })
      // A relay that never answers should not hang the caller forever.
      window.setTimeout(() => {
        if (this.#pendingOk.delete(eventId)) {
          resolve({ accepted: false, message: 'timed out waiting for relay' })
        }
      }, 10000)
    })
  }

  #send(frame: unknown[]): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(frame))
    }
  }

  #flushSubscriptions(): void {
    for (const [id, sub] of this.#subs) {
      if (!sub.sent) {
        this.#send(['REQ', id, ...sub.filters])
        sub.sent = true
      }
    }
  }

  subscribe(
    filters: Record<string, unknown>[],
    onEvent: (event: SignedEvent) => void,
    onEose?: () => void,
  ): () => void {
    const id = `sub-${this.#nextSub++}`
    this.#subs.set(id, { filters, onEvent, onEose, sent: false })
    if (this.#authed) this.#flushSubscriptions()
    return () => {
      if (this.#subs.delete(id)) this.#send(['CLOSE', id])
    }
  }

  async publish(
    event: SignedEvent,
  ): Promise<{ accepted: boolean; message: string }> {
    this.#send(['EVENT', event])
    return this.#awaitOk(event.id)
  }

  /** Fire-and-forget publish for ephemeral events (typing, presence pings). */
  emit(event: SignedEvent): void {
    this.#send(['EVENT', event])
  }

  close(): void {
    this.#closedByUser = true
    this.#ws?.close()
  }
}
