import {
  buildHttpAuthHeader,
  httpOriginOf,
  type BuzzKeypair,
} from './buzzProtocol'
import { relayHttp, type RelayHttpResponse } from '../bridge/platformBridge'

/**
 * Joining a relay that gates membership: Buzz's invite flow.
 *
 * An owner mints a code; possession of the code is the authorization. The new
 * device claims it over NIP-98-signed HTTP — signed by the SAME key that will
 * chat, which is what binds the invite to this identity. Relays may configure
 * a join policy (terms, age attestation); the claim then needs a receipt from
 * the accept-policy endpoint first. Mirrors block/buzz
 * crates/buzz-relay/src/api/invites.rs.
 */

export interface JoinPolicy {
  required: boolean
  version: string | null
  ageAttestationRequired: boolean
  termsUrl: string | null
}

export interface ClaimResult {
  ok: boolean
  status: string
  detail: string | null
}

async function signedPost(
  keypair: BuzzKeypair,
  url: string,
  body: unknown,
): Promise<RelayHttpResponse> {
  const json = JSON.stringify(body)
  return relayHttp(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: await buildHttpAuthHeader(keypair, url, 'POST', json),
    },
    body: json,
  })
}

export async function fetchJoinPolicy(relayUrl: string): Promise<JoinPolicy> {
  const origin = httpOriginOf(relayUrl)
  const response = await relayHttp(`${origin}/api/join-policy`)
  if (!response.ok) {
    return {
      required: false,
      version: null,
      ageAttestationRequired: false,
      termsUrl: null,
    }
  }
  const data = (await response.json()) as Record<string, unknown>
  const version =
    typeof data.version === 'string' && data.version ? data.version : null
  return {
    required: version !== null,
    version,
    ageAttestationRequired: data.age_attestation_required === true,
    termsUrl: version ? `${origin}/api/join-policy/terms` : null,
  }
}

export interface MintedInvite {
  code: string
  /** Unix seconds. */
  expiresAt: number
}

/**
 * Split a shared invite string into its relay code and optional channel id.
 *
 * Relay invites admit you to the relay only, and this relay build lists no
 * channels you are not in — a bare code would leave the invitee staring at an
 * empty sidebar. So an invite minted from inside a channel is shared as
 * "code#channelId", and the join flow claims the code then self-joins the
 * channel (kind:9021, open channels only).
 */
export function splitInvite(input: string): {
  code: string
  channelId: string | null
} {
  const trimmed = input.trim()
  const hash = trimmed.lastIndexOf('#')
  if (hash <= 0) return { code: trimmed, channelId: null }
  return {
    code: trimmed.slice(0, hash),
    channelId: trimmed.slice(hash + 1) || null,
  }
}

/**
 * Mint a single-use invite code. The relay only allows owners and admins —
 * a plain member gets a 403, which surfaces as the thrown error's message.
 * Possession of the code is the whole authorization to join, so it should be
 * handed to exactly one person.
 */
export async function mintInvite(
  keypair: BuzzKeypair,
  relayUrl: string,
  ttlSecs?: number,
): Promise<MintedInvite> {
  const origin = httpOriginOf(relayUrl)
  // Relay bounds: 60s .. 30 days; omitted means the relay default (72h).
  const response = await signedPost(keypair, `${origin}/api/invites`, {
    max_uses: 1,
    ...(ttlSecs ? { ttl_secs: Math.max(60, Math.min(ttlSecs, 2_592_000)) } : {}),
  })
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Invite mint failed (${response.status}).`,
    )
  }
  if (typeof data.code !== 'string' || !data.code) {
    throw new Error('Relay answered without an invite code.')
  }
  return {
    code: data.code,
    expiresAt: typeof data.expires_at === 'number' ? data.expires_at : 0,
  }
}

/**
 * Claim an invite for this device's key. Accepts the join policy on the way
 * when the relay requires one — the pilot treats submitting the code as
 * acceptance and confirms age when demanded; a product surface would show
 * the terms first.
 */
export async function claimInvite(
  keypair: BuzzKeypair,
  relayUrl: string,
  code: string,
): Promise<ClaimResult> {
  const origin = httpOriginOf(relayUrl)
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, status: 'empty', detail: 'No code given.' }

  try {
    let policyReceipt: string | undefined
    const policy = await fetchJoinPolicy(relayUrl)
    if (policy.required && policy.version) {
      const accepted = await signedPost(
        keypair,
        `${origin}/api/invites/accept-policy`,
        {
          code: trimmed,
          policy_version: policy.version,
          age_confirmed: policy.ageAttestationRequired,
        },
      )
      if (!accepted.ok) {
        return {
          ok: false,
          status: 'policy',
          detail: `Join policy not accepted (${accepted.status}).`,
        }
      }
      const receipt = (await accepted.json()) as Record<string, unknown>
      policyReceipt =
        typeof receipt.receipt === 'string' ? receipt.receipt : undefined
    }

    const response = await signedPost(
      keypair,
      `${origin}/api/invites/claim`,
      policyReceipt
        ? { code: trimmed, policy_receipt: policyReceipt }
        : { code: trimmed },
    )
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    if (!response.ok) {
      return {
        ok: false,
        status: String(data.status ?? response.status),
        detail:
          typeof data.error === 'string'
            ? data.error
            : `Claim failed (${response.status}).`,
      }
    }
    return {
      ok: true,
      status: String(data.status ?? 'joined'),
      detail: null,
    }
  } catch (cause) {
    return {
      ok: false,
      status: 'network',
      detail: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

/**
 * The packed invite: one opaque string carrying everything a fresh install
 * needs — the relay and a claim code (and, for legacy open channels, a
 * channel to self-join). "bz1." + base64url(JSON). Pasting it configures
 * the app end-to-end; nothing else to type but your name.
 */
export interface InviteBundle {
  relay: string
  code: string
  channelId: string | null
}

export function packInvite(bundle: {
  relay: string
  code: string
  channelId?: string | null
}): string {
  const payload = JSON.stringify({
    v: 1,
    relay: bundle.relay,
    code: bundle.code,
    ...(bundle.channelId ? { channel: bundle.channelId } : {}),
  })
  const base64 = btoa(payload)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `bz1.${base64}`
}

/**
 * Anything a user might paste into the invite field: a packed bz1 token, a
 * legacy code#channelId, or a bare relay code. Unknown bz1 payloads fail
 * loudly rather than being claimed as a literal code.
 */
export function parseInviteInput(input: string): InviteBundle {
  const trimmed = input.trim()
  if (trimmed.startsWith('bz1.')) {
    const base64 = trimmed
      .slice(4)
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(atob(padded)) as Record<string, unknown>
    } catch {
      throw new Error('that invite is damaged — ask for a fresh one')
    }
    if (payload.v !== 1 || typeof payload.code !== 'string') {
      throw new Error(
        'that invite needs a newer version of the app — or a fresh invite',
      )
    }
    return {
      relay: typeof payload.relay === 'string' ? payload.relay : '',
      code: payload.code,
      channelId:
        typeof payload.channel === 'string' ? payload.channel : null,
    }
  }
  const { code, channelId } = splitInvite(trimmed)
  return { relay: '', code, channelId }
}
