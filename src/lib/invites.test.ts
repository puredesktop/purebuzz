import { describe, expect, it } from 'vitest'
import { splitInvite } from './invites'

describe('splitInvite', () => {
  it('separates a channel-carrying invite', () => {
    expect(splitInvite('abc123#chan-9')).toEqual({
      code: 'abc123',
      channelId: 'chan-9',
    })
  })

  it('passes a bare code through', () => {
    expect(splitInvite('  abc123  ')).toEqual({
      code: 'abc123',
      channelId: null,
    })
  })

  it('tolerates a trailing hash and never returns an empty channel', () => {
    expect(splitInvite('abc123#')).toEqual({ code: 'abc123', channelId: null })
    expect(splitInvite('#chan-9')).toEqual({ code: '#chan-9', channelId: null })
  })
})

describe('packed invites', () => {
  it('round-trips relay + code through the bz1 token', async () => {
    const { packInvite, parseInviteInput } = await import('./invites')
    const token = packInvite({
      relay: 'wss://buzz.example.com',
      code: 'v2.QvkB6SG3Hic',
    })
    expect(token).toMatch(/^bz1\.[A-Za-z0-9_-]+$/)
    expect(parseInviteInput(token)).toEqual({
      relay: 'wss://buzz.example.com',
      code: 'v2.QvkB6SG3Hic',
      channelId: null,
    })
  })

  it('still accepts legacy inputs', async () => {
    const { parseInviteInput } = await import('./invites')
    expect(parseInviteInput('  plaincode  ')).toEqual({
      relay: '',
      code: 'plaincode',
      channelId: null,
    })
    expect(parseInviteInput('code#chan-9')).toEqual({
      relay: '',
      code: 'code',
      channelId: 'chan-9',
    })
  })

  it('rejects damaged and future tokens loudly', async () => {
    const { parseInviteInput, packInvite } = await import('./invites')
    expect(() => parseInviteInput('bz1.!!!')).toThrow(/damaged/)
    const future = packInvite({ relay: 'wss://x', code: 'c' }).replace(
      'bz1.',
      'bz1.',
    )
    // Forge a v2 payload.
    const v2 = 'bz1.' + btoa(JSON.stringify({ v: 2, code: 'c' })).replace(/=+$/, '')
    expect(() => parseInviteInput(v2)).toThrow(/newer version/)
    expect(future).toBeTruthy()
  })
})
