import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({
  publish: vi.fn(async () => ({ ok: true })),
  emit: vi.fn(),
  storeSecretKey: vi.fn(async () => undefined),
  updateBuzzSettings: vi.fn(async () => undefined),
  readSecretKey: vi.fn(async (): Promise<string | null> => null),
  settings: { lastChannel: 'general', hiddenDms: ['dm-1'], lastRead: {} } as Record<string, unknown>,
  deliver: [] as Array<(event: unknown) => void>,
}))

vi.mock('../lib/relayConnection', () => ({
  RelayConnection: class {
    constructor(private readonly options: { onStatus: (status: string) => void }) { queueMicrotask(() => this.options.onStatus('ready')) }
    subscribe(_filters: unknown, onEvent: (event: unknown) => void, onDone?: () => void) { sent.deliver.push(onEvent); onDone?.(); return () => undefined }
    publish = sent.publish
    emit = sent.emit
    close() {}
  },
}))
vi.mock('../bridge/platformBridge', async importOriginal => ({
  ...(await importOriginal<object>()),
  isStandaloneDevMode: () => false,
  fetchBuzzSettings: vi.fn(async () => sent.settings),
  updateBuzzSettings: sent.updateBuzzSettings,
  readSecretKey: sent.readSecretKey,
  storeSecretKey: sent.storeSecretKey,
  migrateLocalStorageKey: vi.fn(async () => null),
}))

const { useBuzzChat } = await import('./useBuzzChat')
const { generateKeypair } = await import('../lib/buzzProtocol')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let chat: ReturnType<typeof useBuzzChat>
function Probe({ second }: { second: boolean }) {
  const [, keep] = useState(0)
  void keep
  chat = useBuzzChat({ second })
  return null
}
let root: Root
const settle = () => act(async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 0)) })

beforeEach(() => {
  vi.clearAllMocks()
  sent.deliver.length = 0
  sent.readSecretKey.mockResolvedValue(generateKeypair().secretKey)
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()) })

it('a second copy with no identity yet does not make one: that is the whole app’s to make, once', async () => {
  sent.readSecretKey.mockResolvedValue(null)
  await act(async () => root.render(<Probe second />))
  await settle()
  expect(sent.storeSecretKey).not.toHaveBeenCalled()
  expect(chat.status).not.toBe('ready')
})

it('the whole app still makes the identity on first run', async () => {
  sent.readSecretKey.mockResolvedValue(null)
  await act(async () => root.render(<Probe second={false} />))
  await settle()
  expect(sent.storeSecretKey).toHaveBeenCalledTimes(1)
})

it('a second copy posts nothing by being open: not even that the person is online', async () => {
  await act(async () => root.render(<Probe second />))
  await settle()
  expect(chat.status).toBe('ready')
  expect(sent.publish).not.toHaveBeenCalled()
})

it('the whole app still says it is online', async () => {
  await act(async () => root.render(<Probe second={false} />))
  await settle()
  expect(sent.publish).toHaveBeenCalled()
})

it('a second copy opens on no conversation, so nothing is watched as read and nothing is written', async () => {
  await act(async () => root.render(<Probe second />))
  await settle()
  const now = Math.floor(Date.now() / 1000)
  await act(async () => {
    for (const deliver of sent.deliver) {
      deliver({ kind: 39000, id: 'c1', pubkey: 'aa', created_at: now, tags: [['d', 'general'], ['name', 'General']], content: '', sig: '' })
      deliver({ kind: 9, id: 'm1', pubkey: 'aa', created_at: now, tags: [['h', 'dm-1']], content: 'hello', sig: '' })
    }
  })
  await settle()
  expect(chat.channels.some(channel => channel.id === 'general')).toBe(true)
  expect(chat.activeChannelId).toBeNull()
  expect(sent.updateBuzzSettings).not.toHaveBeenCalled()
  expect(chat.recent.map(message => message.text)).toEqual(['hello'])
  expect(chat.unread['dm-1']).toBe(1)
})

it('the whole app keeps opening on the last conversation, and keeps a reopened conversation unhidden', async () => {
  await act(async () => root.render(<Probe second={false} />))
  await settle()
  const now = Math.floor(Date.now() / 1000)
  await act(async () => {
    for (const deliver of sent.deliver) {
      deliver({ kind: 39000, id: 'c1', pubkey: 'aa', created_at: now, tags: [['d', 'general'], ['name', 'General']], content: '', sig: '' })
      deliver({ kind: 9, id: 'm1', pubkey: 'aa', created_at: now, tags: [['h', 'dm-1']], content: 'hello', sig: '' })
    }
  })
  await settle()
  expect(chat.activeChannelId).toBe('general')
  expect(sent.updateBuzzSettings).toHaveBeenCalledWith({ hiddenDms: [] })
})
