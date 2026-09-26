# purebuzz app guide

Team messaging for humans and agents, using the open Nostr protocol and a separately hosted Buzz relay. It brings channels, conversations, invitations, attachments, and search into the desktop.

## Workspace layout

| Area | What you use it for |
| --- | --- |
| **Sidebar** | Set the relay address, check connection status, and choose channels or conversations. |
| **Message stream** | Read the active conversation and work with messages and attachments. |
| **Composer** | Write and send a message to the active conversation. |
| **Conversation controls** | Manage invitations and available channel actions; access depends on your relay membership. |

## Working with purebuzz

1. Connect to your team’s relay using the Relay URL field in the sidebar and click Connect.
2. Join with an invitation when the relay requires membership approval; an invitation may also carry the relay address.
3. Choose a channel to read and send messages. Channel creation, invitations, search, and attachments depend on the relay’s permissions and services.

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
See [developer notes](dev-notes.md) for the client protocol and source layout.


## Development and loading

We welcome **developers and vibecoders alike**. [Create a developer account on puredesktop.ai](https://puredesktop.ai/developers), then use Claude Code, Codex, your own editor, or purefactory to develop this app or create a new one.

The [development guide](development.md) covers preparing this repository's shared dependencies, starting a coding agent, adding features in purefactory, and checking the result in the desktop. It includes the commands available in this repository.

Use **Open folder** in purefactory to edit a project externally, and **Open app** to test it. Use **Share** to create a `.pureapp` package, then **Settings → System → Install an app → Choose package…** in current builds to install it. Older versions may provide **File → Install App…**. A development server URL alone does not install an app.

To extend this app in purefactory, select its editable project when available. Source development builds can expose the suite's own apps; packaged installations do not expose every built-in app's source. See [create or extend an app](development.md#create-or-extend-an-app-with-purefactory) for that distinction and the app drawer workflow.

## Source layout

| Path | Purpose |
| --- | --- |
| [plugin.json](../plugin.json) | App identity, entry point, permissions, supported documents, and agent-tool declarations. |
| [package.json](../package.json) | Dependencies and development, build, and validation scripts. |
| [src/App.tsx](../src/App.tsx) | App entry and workspace composition. |
| [src/components](../src/components) | Workspace views, panels, and controls. |
| [src/hooks](../src/hooks) | Boot, state, and interaction hooks. |
| [src/lib](../src/lib) | App data models, document handling, and domain logic. |
| [src/agents](../src/agents) | Agent-tool declarations and handlers. |
| [src/bridge](../src/bridge) | Integration with the desktop’s services. |
| [agents.md](../agents.md) | Instructions and capabilities for the app’s agent. |
| [docs](../docs) | Usage and technical documentation. |

## Developer accounts and the marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

## Contributing

We welcome pull requests, bug reports, new features, and documentation improvements. You may modify and distribute this app under its applicable licenses. See [CONTRIBUTING.md](../CONTRIBUTING.md), [LICENSE](../LICENSE), and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
