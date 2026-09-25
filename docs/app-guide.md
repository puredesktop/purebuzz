# purebuzz app guide

Team chat using a self-hosted Buzz relay and the Nostr protocol.

## Using the app

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

## Development requirements

This app runs within [puredesktop](https://puredesktop.ai). Its local `@purescience/platform-*` dependencies, desktop bridge, and shared shell come from the parent suite and are not included in this repository. Use the matching suite development environment to install and run it; installing this repository alone is not sufficient for a complete desktop application.

With the shared dependencies available, use the scripts in `package.json` from the app directory:

```sh
npm run dev
npm run build
npm run typecheck
npm test
```

`dev` starts the development entry point; `build` prepares the app bundle. Tests and type checking require the same shared dependencies as the app. Host services such as file access and connected accounts must be provided by the suite.

## Contributing

Anyone may modify and share this app under its applicable licenses. We welcome pull requests, bug reports, and documentation improvements. See [contribution guidance](../CONTRIBUTING.md), [the license](../LICENSE), and [third-party notices](../THIRD_PARTY_NOTICES.md).
