// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<{ method: string; args: unknown[] }> = []
let statusResponse: unknown = {
  encryptionAvailable: true,
  backend: 'darwin',
  weak: false,
}
let settingsResponse: unknown = null

vi.mock('@purescience/platform-ui/bridge/client', () => ({
  bridge: {
    call: vi.fn(async (method: string, args: unknown[]) => {
      calls.push({ method, args })
      if (method === 'secrets.status') return statusResponse
      if (method === 'settings.app.get') return settingsResponse
      return null
    }),
  },
}))

vi.mock('@purescience/platform-ui/bridge/methods', () => ({
  PLATFORM_BRIDGE_METHODS: {
    SECRETS_GET: 'secrets.get',
    SECRETS_SET: 'secrets.set',
    SECRETS_STATUS: 'secrets.status',
    SETTINGS_APP_GET: 'settings.app.get',
    SETTINGS_APP_UPDATE: 'settings.app.update',
    NETWORK_FETCH: 'network.fetch',
  },
}))

const LEGACY_KEY = 'purescience:purebuzz:secret-key'
const SECRET = 'a'.repeat(64)

/**
 * The shell writes `enc: "plain"` when no keystore answers. For an API token
 * that is a shrug; for the key that signs everything you say it is the whole
 * threat model, silently gone. These pin the rule that the write is refused
 * instead.
 */
describe('identity key storage', () => {
  beforeEach(async () => {
    calls.length = 0
    statusResponse = {
      encryptionAvailable: true,
      backend: 'darwin',
      weak: false,
    }
    window.localStorage.clear()
    vi.stubEnv('DEV', false)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('stores the key when the OS keystore really encrypts', async () => {
    const { storeSecretKey } = await import('./platformBridge')
    await storeSecretKey(SECRET)
    const set = calls.find(call => call.method === 'secrets.set')
    expect(set).toBeTruthy()
    expect(calls.some(call => call.method === 'secrets.status')).toBe(true)
  })

  it('refuses to write the key when there is no keystore', async () => {
    statusResponse = {
      encryptionAvailable: false,
      backend: 'unknown',
      weak: true,
    }
    const { storeSecretKey, UnprotectedKeystoreError } = await import(
      './platformBridge'
    )
    await expect(storeSecretKey(SECRET)).rejects.toBeInstanceOf(
      UnprotectedKeystoreError,
    )
    // The point of the exercise: nothing was handed to the shell to write.
    expect(calls.some(call => call.method === 'secrets.set')).toBe(false)
  })

  it('refuses a keystore that answers but encrypts weakly', async () => {
    statusResponse = {
      encryptionAvailable: true,
      backend: 'basic_text',
      weak: true,
    }
    const { storeSecretKey } = await import('./platformBridge')
    await expect(storeSecretKey(SECRET)).rejects.toThrow(/does not encrypt/i)
    expect(calls.some(call => call.method === 'secrets.set')).toBe(false)
  })

  it('keeps the legacy plaintext key until the encrypted copy is written', async () => {
    statusResponse = {
      encryptionAvailable: false,
      backend: 'unknown',
      weak: true,
    }
    window.localStorage.setItem(LEGACY_KEY, SECRET)
    const { migrateLocalStorageKey } = await import('./platformBridge')
    await expect(migrateLocalStorageKey()).rejects.toThrow()
    // Removing it after a refused store would destroy the very identity the
    // migration exists to preserve.
    expect(window.localStorage.getItem(LEGACY_KEY)).toBe(SECRET)
  })

  it('drops the legacy plaintext key once it is safely stored', async () => {
    window.localStorage.setItem(LEGACY_KEY, SECRET)
    const { migrateLocalStorageKey } = await import('./platformBridge')
    await expect(migrateLocalStorageKey()).resolves.toBe(SECRET)
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(calls.some(call => call.method === 'secrets.set')).toBe(true)
  })
})

describe('app settings', () => {
  beforeEach(() => {
    calls.length = 0
    settingsResponse = null
    vi.stubEnv('DEV', false)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the settings object the shell returns — there is no wrapper', async () => {
    // Expecting {settings: …} here silently discarded every saved value,
    // which is why the relay URL never survived a restart.
    settingsResponse = { relayUrl: 'wss://team.example' }
    const { fetchBuzzSettings } = await import('./platformBridge')
    await expect(fetchBuzzSettings()).resolves.toEqual({
      relayUrl: 'wss://team.example',
    })
  })

  it('treats an empty answer as no settings', async () => {
    const { fetchBuzzSettings } = await import('./platformBridge')
    await expect(fetchBuzzSettings()).resolves.toEqual({})
  })
})
