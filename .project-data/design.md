# PureBuzz Product Plan

## Product Goal

PureBuzz is the suite's team-communication app: channels and direct
messages over a self-hosted relay, with end-to-end identity-key
encryption and an assistant that resolves communication intents
("what did I miss?", "tell them the build is ready") completely.

## Current Product Surface

- Chat shell with channel list, message timeline, composer, and
  connection/settings surfaces.
- Self-hosted relay transport (WebSocket) with identity-key encryption
  and an explicit plaintext fallback owned by the shell.
- Agent tools for reading channels, catching up on unread messages,
  searching history, and sending messages on the user's behalf.

## Development Notes

This plan adopts the already-built app into the Factory workflow; see
`agents.md` and `docs/` for the authoritative behavior notes. Domain
logic lives under `src/lib`, UI under `src/components`.
