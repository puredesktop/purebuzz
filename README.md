<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="purebuzz icon"></p>

# purebuzz

## What purebuzz does

Team messaging for humans and agents, using the open Nostr protocol and a separately hosted Buzz relay. It brings channels, conversations, invitations, attachments, and search into the desktop.

## App layout

| Area | What you use it for |
| --- | --- |
| **Sidebar** | Set the relay address, check connection status, and choose channels or conversations. |
| **Message stream** | Read the active conversation and work with messages and attachments. |
| **Composer** | Write and send a message to the active conversation. |
| **Conversation controls** | Manage invitations and available channel actions; access depends on your relay membership. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Getting started

1. Connect to your team’s relay using the Relay URL field in the sidebar and click Connect.
2. Join with an invitation when the relay requires membership approval; an invitation may also carry the relay address.
3. Choose a channel to read and send messages. Channel creation, invitations, search, and attachments depend on the relay’s permissions and services.

Read the [app guide](docs/app-guide.md) for development, loading, and source-layout details.

## Relay required

**purebuzz needs a separately running, compatible [Buzz relay](https://github.com/block/buzz).**
This repository contains the client app; it does not include or provision the relay server.
The relay stores and distributes messages and provides membership, search, and media services.
A generic public Nostr relay may not support the Buzz-specific APIs this client uses.

1. Follow the upstream [local setup guide](https://github.com/block/buzz#quick-start) to install its prerequisites and start the supporting services. In the Buzz checkout, run `just setup` and `just build`, then `just relay` with the upstream toolchain activated.
2. Open purebuzz in [puredesktop](https://puredesktop.ai). Enter the server’s WebSocket URL in the sidebar’s **Relay URL** field and click **Connect**. The default is `ws://localhost:3000` for local development; use your deployment’s `wss://` address for a hosted server.
3. Join using an invitation if your relay requires one, and wait for the connection status to become **connected** before chatting.

For a hosted deployment, see Buzz’s [production deployment documentation](https://github.com/block/buzz/tree/main/deploy/compose).
If connection fails, check that the relay is running, the URL is reachable, and your identity has membership access.
See [developer notes](docs/dev-notes.md) for the client protocol and source layout.

## Develop and customize

We welcome **developers and vibecoders alike**. You can add features to purebuzz, develop a fork, or create a new app for [puredesktop](https://puredesktop.ai).

### Use Claude Code, Codex, or your own tools

Open a local source checkout or a purefactory project's folder in your preferred coding tool. Ask it to read this README, `plugin.json`, `package.json`, `agents.md`, and the [development guide](docs/development.md) before making changes. Review the changes, run the app's checks, and test it inside [puredesktop](https://puredesktop.ai). This source may require matching shared platform packages; a browser preview alone does not provide desktop services.

The [development guide](docs/development.md) explains how to start Claude Code or Codex in the project, work on this repository, and load your app into the desktop.

### Use purefactory inside the desktop

Open **purefactory** (Factory) to describe a new app, or select an available app project and request a feature. Use **Open folder** to continue with external tools and **Open app** to test the result. You can also request a local app change through the app's drawer where app-development integration is available; distinguish changing the app from editing its current document.

Use **Share** in purefactory to create a `.pureapp` package. In current builds, install it through **Settings → System → Install an app → Choose package…**. See the [development guide](docs/development.md#load-and-share-your-app) for the full workflow and version differences.

## Developer accounts and the marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

## Open source and contributions

Team communication using the open Nostr protocol.

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

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
