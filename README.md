<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="purebuzz icon"></p>

# purebuzz

## App documentation

Team chat using a self-hosted Buzz relay and the Nostr protocol.

1. Connect to your team’s relay using the Relay URL field in the sidebar and click Connect.
2. Join with an invitation when the relay requires membership approval; an invitation may also carry the relay address.
3. Choose a channel to read and send messages. Channel creation, invitations, search, and attachments depend on the relay’s permissions and services.

Read the [app guide](docs/app-guide.md) for usage and development requirements. This app runs within [puredesktop](https://puredesktop.ai).

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
