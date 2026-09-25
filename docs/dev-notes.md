# PureBuzz agent guide

Option B pilot from the Buzz evaluation: a native PureDesktop surface over a
self-hosted [Buzz](https://github.com/block/buzz) (Nostr) relay. We own the UI;
Block's relay owns storage, fan-out, membership and search.

## Shape

- `src/lib/buzzProtocol.ts` — the slice of Buzz's protocol we speak: kinds,
  signed-event builders, parsers. Pure and unit-tested. Mirrors
  block/buzz `crates/buzz-core/src/kind.rs`; that file wins when they disagree.
- `src/lib/relayConnection.ts` — one authenticated NIP-01 WebSocket:
  NIP-42 handshake, subscription replay after (re)auth, publish-with-OK,
  reconnect backoff. Buzz fails closed until auth completes — subscriptions
  made earlier are queued, not lost.
- `src/hooks/useBuzzChat.ts` — identity (device keypair in localStorage — the
  pilot shortcut; escrow design lives in the evaluation doc), channels from
  NIP-29 kind:39000 metadata, messages per channel, send/create.
- `src/App.tsx` — AppFrame, channel sidebar, stream, composer, status bar.

## Protocol facts (verified against a live relay)

- Auth: relay sends `["AUTH", challenge]`; answer with signed kind:22242
  carrying `relay` + `challenge` tags.
- Message: kind:9 with `["h", channelId]`.
- Create channel: kind:9007 with `name`/`visibility`/`channel_type` tags.
- Join: kind:9021 with `["h", channelId]`.
- Channel state: relay-published kind:39000 (id in the `d` tag).

## Running

Needs a relay: `cd <buzz checkout> && PATH="$PWD/bin:$PATH" just relay`
(Docker services via `just setup` first). The app connects to
`ws://localhost:3000` by default.
