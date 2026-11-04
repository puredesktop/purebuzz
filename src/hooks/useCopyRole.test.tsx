import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('@purescience/platform-ui/bridge/client', () => ({ bridge: { call } }))
const { useCopyRole } = await import('./useCopyRole')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const realParent = Object.getOwnPropertyDescriptor(window, 'parent')
const realTop = Object.getOwnPropertyDescriptor(window, 'top')
let seen: ReturnType<typeof useCopyRole>
function Probe() { seen = useCopyRole(); return null }
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  const top = {}
  Object.defineProperty(window, 'top', { configurable: true, value: top })
  Object.defineProperty(window, 'parent', { configurable: true, value: top })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  if (realParent) Object.defineProperty(window, 'parent', realParent)
  if (realTop) Object.defineProperty(window, 'top', realTop)
})

it('the bridge answering held stays held: the safety timer does not flip it back to whole', async () => {
  call.mockResolvedValue({ tabId: 'held:1', name: 'the conversation', heldInRoom: true })
  await act(async () => root.render(<Probe />))
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(seen).toEqual({ known: true, compact: true, second: true })
})

it('nothing is known until it is told, and a tab of its own is whole', async () => {
  let answer: (value: unknown) => void = () => undefined
  call.mockReturnValue(new Promise(resolve => { answer = resolve }))
  await act(async () => root.render(<Probe />))
  expect(seen.known).toBe(false)
  await act(async () => { answer(null); await vi.advanceTimersByTimeAsync(0) })
  expect(seen).toEqual({ known: true, compact: false, second: false })
})

it('a shell that never answers does not stop the whole app starting', async () => {
  call.mockReturnValue(new Promise(() => undefined))
  await act(async () => root.render(<Probe />))
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(seen).toEqual({ known: true, compact: false, second: false })
})

it('a room letting go gives the whole page back, but it is still the second copy', async () => {
  call.mockResolvedValue({ tabId: 'held:1', name: 'the room', heldInRoom: true })
  const parent = window.parent
  await act(async () => root.render(<Probe />))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: parent as unknown as Window, data: { type: 'pure:adjacent-app', app: null } })) })
  expect(seen).toEqual({ known: true, compact: false, second: true })
})

it('has no style that can apply with compact off: every selector starts from the compact frame', () => {
  const rules = readFileSync(join(process.cwd(), 'src/compact-in-room.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = [...rules.matchAll(/([^{}]+)\{/g)].flatMap(m => m[1]!.split(',')).map(s => s.trim())
  expect(selectors.length).toBeGreaterThan(3)
  for (const selector of selectors) expect(selector).toMatch(/^(\[data-compact-room\]|html\[data-held-in-room\]:has\(\[data-compact-room\]\))/)
})
