import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'

/**
 * Where PureBuzz's two pieces of state live, and why they live apart.
 *
 * The RELAY URL is configuration: it goes through the shell's per-app
 * settings, so it persists with the workspace and is visible to agents and
 * backups like any other app setting.
 *
 * The SECRET KEY is identity: it goes through the shell's secrets store —
 * slug-scoped to this app and encrypted with the OS keystore (Electron
 * safeStorage). It must never sit in settings or localStorage where anything
 * that can read the workspace can sign as you.
 *
 * "When one is available" used to be the whole story, and that was the hole:
 * the shell falls back to writing `enc: "plain"` when no keystore answers, so
 * the one secret in this app that IS the user's identity could land on disk
 * in the clear with nothing said. Encryption is now checked before the write
 * and refused if it is not real — see storeSecretKey.
 *
 * Standalone dev (vite outside the shell) falls back to localStorage for
 * both, clearly marked as the dev-only path.
 */

const APP_SLUG = 'buzz'
const SECRET_KEY_NAME = 'device-secret-key'
const STANDALONE_SETTINGS = 'purescience:purebuzz:settings'
const STANDALONE_SECRET = 'purescience:purebuzz:secret-key'

export interface PureBuzzSettings {
  relayUrl?: string
  /** channelId → unix seconds of the newest message the user has seen. */
  lastRead?: Record<string, number>
  /** The conversation that was open, restored on next launch. */
  lastChannel?: string
  /** Channels the user muted — no unread counting. */
  muted?: string[]
  /** DM conversations the user closed; auto-reopen on new activity. */
  hiddenDms?: string[]
  /**
   * Where link cards unfurl. Reader-side unfurling touches the linked host
   * from this machine, so DMs stay off unless explicitly 'all'.
   */
  linkPreviews?: 'off' | 'channels' | 'all'
}

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

export async function fetchBuzzSettings(): Promise<PureBuzzSettings> {
  if (isStandaloneDevMode()) {
    try {
      return JSON.parse(
        window.localStorage.getItem(STANDALONE_SETTINGS) ?? '{}',
      ) as PureBuzzSettings
    } catch {
      return {}
    }
  }
  // The shell returns the app's settings object itself, not a wrapper —
  // reading a nonexistent .settings off it silently discarded every saved
  // value, which is why the relay URL never survived a restart.
  const response = await bridge.call<PureBuzzSettings | null>(
    PLATFORM_BRIDGE_METHODS.SETTINGS_APP_GET,
    [APP_SLUG],
  )
  return response ?? {}
}

export async function updateBuzzSettings(
  patch: Partial<PureBuzzSettings>,
): Promise<void> {
  if (isStandaloneDevMode()) {
    const current = await fetchBuzzSettings()
    window.localStorage.setItem(
      STANDALONE_SETTINGS,
      JSON.stringify({ ...current, ...patch }),
    )
    return
  }
  await bridge.call(PLATFORM_BRIDGE_METHODS.SETTINGS_APP_UPDATE, [
    { appSlug: APP_SLUG, patch },
  ])
}

export interface SecretsStatus {
  encryptionAvailable: boolean
  backend: string
  /** True when secrets would be stored weakly, or not encrypted at all. */
  weak: boolean
}

/** Thrown rather than writing an identity key the OS cannot protect. */
export class UnprotectedKeystoreError extends Error {
  constructor(readonly status: SecretsStatus) {
    super(
      status.encryptionAvailable
        ? `This device's keystore (${status.backend}) does not encrypt strongly enough to hold an identity key.`
        : 'This device has no secure keystore, so an identity key cannot be stored safely.',
    )
    this.name = 'UnprotectedKeystoreError'
  }
}

/**
 * What the shell can actually promise about secrets on this machine. The
 * shell computes it and, until now, nobody asked — so a plaintext fallback
 * was invisible to every app and every user.
 */
export async function fetchSecretsStatus(): Promise<SecretsStatus> {
  if (isStandaloneDevMode()) {
    return { encryptionAvailable: false, backend: 'standalone-dev', weak: true }
  }
  const response = await bridge.call<SecretsStatus>(
    PLATFORM_BRIDGE_METHODS.SECRETS_STATUS,
    [],
  )
  return (
    response ?? { encryptionAvailable: false, backend: 'unknown', weak: true }
  )
}

export async function readSecretKey(): Promise<string | null> {
  if (isStandaloneDevMode()) {
    return window.localStorage.getItem(STANDALONE_SECRET)
  }
  const response = await bridge.call<{ value: string | null }>(
    PLATFORM_BRIDGE_METHODS.SECRETS_GET,
    [{ key: SECRET_KEY_NAME }],
  )
  return response?.value ?? null
}

/**
 * Store the identity key, or refuse.
 *
 * The shell writes `enc: "plain"` when no keystore answers — silently. For an
 * API token that is a shrug; for the key that signs everything you say, it is
 * the whole threat model gone with nothing on screen to say so. So the status
 * is checked first and the write is refused rather than made unsafely: the
 * caller keeps the identity in memory for the session and tells the user it
 * is not being saved, which is a cost they can see.
 */
export async function storeSecretKey(secretHex: string): Promise<void> {
  if (isStandaloneDevMode()) {
    window.localStorage.setItem(STANDALONE_SECRET, secretHex)
    return
  }
  const status = await fetchSecretsStatus()
  if (status.weak) throw new UnprotectedKeystoreError(status)
  await bridge.call(PLATFORM_BRIDGE_METHODS.SECRETS_SET, [
    { key: SECRET_KEY_NAME, value: secretHex },
  ])
}

/**
 * The pilot's first day kept the key in localStorage. If one is there, move
 * it into the secrets store so the identity that already posted survives —
 * then remove the plaintext copy.
 */
export async function migrateLocalStorageKey(): Promise<string | null> {
  const legacy = window.localStorage.getItem('purescience:purebuzz:secret-key')
  if (!legacy || isStandaloneDevMode()) return legacy
  // Only drop the plaintext copy once the encrypted one is definitely
  // written. Removing it after a refused or failed store would destroy the
  // identity it was there to preserve.
  await storeSecretKey(legacy)
  window.localStorage.removeItem('purescience:purebuzz:secret-key')
  return legacy
}

export interface RelayHttpResponse {
  ok: boolean
  status: number
  headers: Record<string, string>
  json: () => Promise<unknown>
  /** Raw body: text normally, base64 when responseEncoding was 'base64'. */
  body: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * HTTP to the relay's REST API (invites, join policy). Inside the shell this
 * rides the network bridge — a main-process fetch — because CORS is a
 * browser-only rule the relay's origin list rightly doesn't cater to: real
 * Buzz clients are native apps, and via the bridge, so is this one.
 * Standalone dev falls back to the browser's fetch.
 */
/**
 * Main-process HTTP for ANY url — the same CORS-free path the relay REST
 * calls use, generalised because link unfurling needs arbitrary hosts.
 */
export async function bridgeFetch(
  url: string,
  init: {
    method?: string
    headers?: Record<string, string>
    /** Text, or base64 when bodyEncoding is 'base64'. */
    body?: string
    bodyEncoding?: 'utf8' | 'base64'
    responseEncoding?: 'utf8' | 'base64'
  } = {},
): Promise<RelayHttpResponse> {
  if (isStandaloneDevMode()) {
    const body: BodyInit | undefined =
      init.body !== undefined && init.bodyEncoding === 'base64'
        ? (base64ToBytes(init.body).buffer as ArrayBuffer)
        : init.body
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body,
    })
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    const raw =
      init.responseEncoding === 'base64'
        ? bytesToBase64(new Uint8Array(await response.arrayBuffer()))
        : await response.text()
    return {
      ok: response.ok,
      status: response.status,
      headers,
      body: raw,
      json: async () => JSON.parse(raw) as unknown,
    }
  }
  const response = await bridge.call<{
    ok: boolean
    status: number
    headers?: Record<string, string>
    body: string
  }>(PLATFORM_BRIDGE_METHODS.NETWORK_FETCH, [{ url, ...init }])
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers ?? {},
    body: response.body,
    json: async () => JSON.parse(response.body) as unknown,
  }
}

/** Relay REST rides the same bridge; the name records the original intent. */
export const relayHttp = bridgeFetch
