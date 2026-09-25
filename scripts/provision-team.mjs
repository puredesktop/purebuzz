#!/usr/bin/env node
/**
 * Team provisioning for a multi-tenant buzz relay — the "pre-created teams,
 * handed to their admin" flow:
 *
 *   1. provision <host>       Create the community with YOU as interim owner,
 *                             mint a 30-day invite on it, print the packed
 *                             bz1 token to send the customer.
 *   2. (customer claims — their pubkey appears on the team roster)
 *   3. transfer <host> <key>  Make them the owner; you drop to member.
 *   4. list                   Every community you operate, with ids.
 *
 * Env:
 *   OPERATOR_SECRET  nsec1… or 64-char hex — a key in RELAY_OPERATOR_PUBKEYS
 *   OPERATOR_ORIGIN  RELAY_OPERATOR_API_ORIGIN, e.g. https://buzz.example.com
 *
 * Run from apps/purebuzz (resolves nostr-tools from the workspace):
 *   OPERATOR_SECRET=nsec1… OPERATOR_ORIGIN=https://… \
 *     node scripts/provision-team.mjs provision team-a.buzz.example.com
 */
import { createHash } from 'node:crypto'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'

const secretInput = process.env.OPERATOR_SECRET ?? ''
const origin = (process.env.OPERATOR_ORIGIN ?? '').replace(/\/+$/, '')
const [command, ...args] = process.argv.slice(2)

function die(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

if (!origin) die('OPERATOR_ORIGIN is required')
const secretHex = secretInput.startsWith('nsec1')
  ? Buffer.from(nip19.decode(secretInput).data).toString('hex')
  : secretInput
if (!/^[0-9a-f]{64}$/i.test(secretHex))
  die('OPERATOR_SECRET must be an nsec or 64-char hex secret key')
const secretBytes = Uint8Array.from(Buffer.from(secretHex, 'hex'))

function nip98(url, method, body) {
  const tags = [
    ['u', url],
    ['method', method.toUpperCase()],
  ]
  if (body !== undefined) {
    tags.push(['payload', createHash('sha256').update(body).digest('hex')])
  }
  const event = finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    },
    secretBytes,
  )
  return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`
}

async function call(url, method, bodyObject) {
  const body = bodyObject === undefined ? undefined : JSON.stringify(bodyObject)
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: nip98(url, method, body),
    },
    body,
  })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  if (!response.ok)
    die(`${method} ${url} → ${response.status}: ${data.error ?? text}`)
  return data
}

function parsePubkey(input) {
  const trimmed = input.trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (trimmed.startsWith('npub1')) return nip19.decode(trimmed).data
  die('expected an npub or 64-char hex pubkey')
}

function packInvite(relay, code) {
  const payload = JSON.stringify({ v: 1, relay, code })
  return `bz1.${Buffer.from(payload)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`
}

const operatorPubkey = getPublicKey(secretBytes)

async function findCommunity(hostOrId) {
  const listing = await call(`${origin}/operator/communities`, 'GET')
  const communities = listing.communities ?? listing
  const match = (Array.isArray(communities) ? communities : []).find(
    entry =>
      entry.host === hostOrId ||
      entry.community_id === hostOrId ||
      entry.id === hostOrId,
  )
  if (!match) die(`no community matching "${hostOrId}" — try: list`)
  return match
}

if (command === 'list') {
  const listing = await call(`${origin}/operator/communities`, 'GET')
  console.log(JSON.stringify(listing, null, 2))
} else if (command === 'provision') {
  const host = args[0] ?? die('usage: provision <host>')
  const created = await call(`${origin}/operator/communities`, 'POST', {
    host,
    initial_owner_pubkey: operatorPubkey,
  })
  console.log(`community created: ${JSON.stringify(created)}`)
  // Mint the handover invite ON the new team (we are its interim owner).
  const inviteUrl = `https://${host}/api/invites`
  const invite = await call(inviteUrl, 'POST', {
    max_uses: 1,
    ttl_secs: 30 * 24 * 3600,
  })
  const token = packInvite(`wss://${host}`, invite.code)
  console.log('\nSend the customer this invite token (valid 30 days):\n')
  console.log(`  ${token}\n`)
  console.log(
    'When they appear on the roster, hand the team over with:\n' +
      `  node scripts/provision-team.mjs transfer ${host} <their npub>`,
  )
} else if (command === 'transfer') {
  const [hostOrId, key] = args
  if (!hostOrId || !key) die('usage: transfer <host-or-community-id> <npub|hex>')
  const community = await findCommunity(hostOrId)
  const communityId = community.community_id ?? community.id
  const result = await call(`${origin}/operator/communities/transfer`, 'POST', {
    community_id: communityId,
    new_owner_pubkey: parsePubkey(key),
  })
  console.log(`ownership transferred: ${JSON.stringify(result)}`)
  console.log('You are now a plain member of that team; leave it when ready.')
} else {
  die('commands: list · provision <host> · transfer <host-or-id> <npub|hex>')
}
