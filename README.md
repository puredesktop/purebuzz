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

You can develop this app outside [puredesktop](https://puredesktop.ai), using your preferred editor, terminal, and coding tools, then load the module into [puredesktop](https://puredesktop.ai) to use and test it. You can also change your local version from **purefactory** or through **the app’s drawer agent**.

### Use your own development tools

1. Fork or clone this repository and work on a local copy in your editor.
2. Set up the app’s dependencies and run its development server or build. See the [app guide](docs/app-guide.md#development-and-loading) for this repository’s requirements and scripts.
3. Load the module into [puredesktop](https://puredesktop.ai). For a local web development server, the platform guide describes **File → Register App…**: register its URL, app name, and required permissions, then open it from **Browse Apps**. Keep the development server running while using that entry point.
4. Make changes in your editor, reload the app as needed, and test its file, account, and agent integrations inside the desktop. A distributable `.pureapp` package can be loaded through **File → Install App…**.

See the [app development and integration guide](https://puredesktop.ai/docs/apps/) for registration, the app manifest, the bridge, and packaging. Editing outside the desktop does not remove this module’s shared-dependency requirements.

### Use purefactory or the app’s drawer agent

Open your local app project in **purefactory** to develop it there, or open the app’s **drawer agent** and describe the change you want to make to your local version. Specify whether you want to change the app itself or work on the document or data currently open. Review the resulting source changes, run the relevant checks, and reload your local app to try them. You can keep the changes for yourself, develop a fork, or contribute them back with a pull request.

## Developer accounts and the marketplace

[Create a developer account on puredesktop.ai](https://puredesktop.ai/developers) to take part in the developer community and submit apps for review. We welcome contributions to this app, forks that take it in a different direction, and entirely new apps to offer on [puredesktop](https://puredesktop.ai).

We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. A marketplace with support for **paid apps is coming soon**, so developers will be able to charge for their apps if they choose. When distributing a fork, follow the licenses of the code and dependencies you use.

For more information about developer accounts, app submissions, or the upcoming marketplace, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

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
