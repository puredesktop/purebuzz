<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="purebuzz icon"></p>

# purebuzz

**Team conversations for humans and agents.** An app for [puredesktop](https://puredesktop.ai).

[Get started](#getting-started) · [App guide](docs/app-guide.md) · [Develop](docs/development.md) · [Developer account](https://puredesktop.ai/developers)

## What it does

Team messaging for humans and agents, using the open Nostr protocol and a separately hosted Buzz relay. It brings channels, conversations, invitations, attachments, and search into the desktop.

## Requirements

Use a compatible [puredesktop](https://puredesktop.ai) build for desktop integration, storage, and the app drawer. Developer setup is covered in the [development guide](docs/development.md).

**A separately running compatible [Buzz relay](https://github.com/block/buzz) is required.** Configure its WebSocket URL and join with an invitation where required. The relay provides membership, messages, search, and media; a generic Nostr relay may not support these APIs.

## Getting started

1. Connect to your team’s relay using the Relay URL field in the sidebar and click Connect.
2. Join with an invitation when the relay requires membership approval; an invitation may also carry the relay address.
3. Choose a channel to read and send messages. Channel creation, invitations, search, and attachments depend on the relay’s permissions and services.

## App layout

| Area | What you use it for |
| --- | --- |
| **Sidebar** | Set the relay address, check connection status, and choose channels or conversations. |
| **Message stream** | Read the active conversation and work with messages and attachments. |
| **Composer** | Write and send a message to the active conversation. |
| **Conversation controls** | Manage invitations and available channel actions; access depends on your relay membership. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Working with the agent

Open the app’s drawer in [puredesktop](https://puredesktop.ai) and describe what you want to do. For example:

> Summarize the latest messages in this channel.
>
> Find messages about the release plan.

The app exposes 10 tools, including `getBuzzContext`, `listChannels`, `readMessages`. See [agents.md](agents.md) for workflows and [plugin.json](plugin.json) for the complete tool schemas and approval flags. Sending messages and uploading media require approval.

## Files and data

Messages and uploaded attachments are stored and distributed by your relay. Sending posts under your identity to conversation members; account access and retention depend on your relay deployment.

## Develop and customize

We welcome **developers and vibecoders alike**. Fork purebuzz, add a feature, or use what you learn to build a new app.

| Develop your way | Workflow |
| --- | --- |
| **Claude Code, Codex, or your editor** | Open the app’s source folder, read `README.md`, `plugin.json`, `package.json`, and `agents.md`, then make changes and run the app’s checks. Test inside [puredesktop](https://puredesktop.ai) with matching shared platform packages. |
| **purefactory** | Choose **Start building** for a new app, or select an available app project to extend it. Use **Open folder** for external tools and **Open app** to test. |
| **App drawer** | Request a local app change where app-development integration is available. Make clear whether you want to change the app itself or its current document. |

Use **Share** in purefactory to create a `.pureapp` package, then **Settings → System → Install an app → Choose package…** to load it in current builds. Source availability and integration vary by host build.

Follow the [development guide](docs/development.md) for Claude Code/Codex commands, app-specific setup and checks, and packaging. A standalone browser preview does not provide every desktop service.

## Documentation and limitations

| Guide | What it covers |
| --- | --- |
| [App guide](docs/app-guide.md) | App overview, source layout, and usage. |
| [Development guide](docs/development.md) | External coding tools, purefactory, checks, and installation. |
| [Agent guide](agents.md) | App-specific agent workflows and constraints. |
| [Relay setup](docs/relay-setup.md) | Required server, connection, membership, and troubleshooting. |

Connection, search, attachments, and channel access depend on the relay and your membership. See the relay setup guide below.

## Contributing and marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

Anyone may use, study, modify, and share this app under its applicable licenses. We welcome pull requests, bug reports, and documentation improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and license

Team communication using the open Nostr protocol.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [block/buzz](https://github.com/block/buzz) | [Homepage / docs](https://github.com/block/buzz#quick-start) | — |
| [nbd-wtf/nostr-tools](https://github.com/nbd-wtf/nostr-tools) | [Project home](https://github.com/nbd-wtf/nostr-tools) | — |
| [paulmillr/noble-curves](https://github.com/paulmillr/noble-curves) | [Homepage / docs](https://paulmillr.com/noble) | [GitHub Sponsors](https://github.com/sponsors/paulmillr) |
| [soldair/node-qrcode](https://github.com/soldair/node-qrcode) | [Project home](https://github.com/soldair/node-qrcode) | — |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
