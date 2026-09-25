import { describe, expect, it } from 'vitest'
import {
  buildPairingUri,
  deriveSasInput,
  deriveSessionId,
  deriveTranscriptHash,
  ecdhX,
  sasCodeOf,
} from './pairing'
import { generateKeypair } from './buzzProtocol'

describe('pairing crypto', () => {
  it('derives a deterministic 32-byte session id', async () => {
    const secret = new Uint8Array(32).fill(7)
    const a = await deriveSessionId(secret)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await deriveSessionId(secret)).toBe(a)
    expect(await deriveSessionId(new Uint8Array(32).fill(8))).not.toBe(a)
  })

  it('ECDH is symmetric between the two ephemeral keys', () => {
    const source = generateKeypair()
    const target = generateKeypair()
    expect(ecdhX(source.secretKey, target.publicKey)).toEqual(
      ecdhX(target.secretKey, source.publicKey),
    )
  })

  it('produces a matching zero-padded six-digit SAS on both sides', async () => {
    const source = generateKeypair()
    const target = generateKeypair()
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const sasSource = sasCodeOf(
      await deriveSasInput(ecdhX(source.secretKey, target.publicKey), secret),
    )
    const sasTarget = sasCodeOf(
      await deriveSasInput(ecdhX(target.secretKey, source.publicKey), secret),
    )
    expect(sasSource).toBe(sasTarget)
    expect(sasSource).toMatch(/^\d{6}$/)
  })

  it('transcript hash binds all session parameters', async () => {
    const secret = new Uint8Array(32).fill(1)
    const sas = new Uint8Array(32).fill(2)
    const base = await deriveTranscriptHash('ab'.repeat(32), 'cd'.repeat(32), 'ef'.repeat(32), sas, secret)
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    const swapped = await deriveTranscriptHash('ab'.repeat(32), 'ef'.repeat(32), 'cd'.repeat(32), sas, secret)
    expect(swapped).not.toBe(base)
  })

  it('builds the spec URI shape', () => {
    const uri = buildPairingUri('a'.repeat(64), 'b'.repeat(64), 'wss://relay.example/pair')
    expect(uri).toBe(
      `nostrpair://${'a'.repeat(64)}?secret=${'b'.repeat(64)}&relay=wss%3A%2F%2Frelay.example%2Fpair&v=1`,
    )
  })
})
