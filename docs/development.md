# Development (not end-user setup)

The product is a Gladys-managed **Linux Docker container**. These optional tools
only help developers build and register that same artifact. They are not copied
into the image and are not required by users. There is no idle placeholder
container or macOS startup service.

## Build and install manually

Use Node.js 24, Docker and a compatible Gladys instance. Build on the Docker
daemon that Gladys uses; a tag on a different daemon is not visible to Gladys.

```sh
npm ci
npm test
npm run lint
npm run format:check
npm run dev:prepare
```

On a new checkout, `dev:prepare` builds the real `Dockerfile` as
`ghcr.io/stefanbauer/gladys-freeathome:1.1.0`, with the manifest embedded in the official
`io.gladysassistant.manifest` image label. It does not install or publish anything.
In Gladys' developer-mode installation form, select that local image and supply
the manifest if requested. Configure the controller in Gladys. No token needs
to be copied out of Docker and no native `npm start` is needed.

Local builds target the Docker daemon's architecture. Cross-build a private
test image when the target differs, for example:

```sh
docker build --platform linux/amd64 -t ghcr.io/stefanbauer/gladys-freeathome:1.1.0 .
```

For this direct build, pass `gladys-assistant-integration.json` explicitly at
installation; it does not add the manifest image label. Before an update, embed
the current manifest using `dev:prepare` or Docker's `--label` option so Gladys
can refresh the schema. Do not publish a single-platform test image as though
it were a verified multi-architecture release.

## Optional loopback development helper

For a Gladys API on the **same development machine**, the helper uses
`http://localhost:1443` by default. `GLADYS_HOST_API_URL` can select another
loopback origin. This restriction protects development credentials; the
**container runtime has no loopback restriction** and uses the URL injected by
Gladys. The frontend address is independent (port 1444 on the shared development
instance). Core and other integrations must remain unchanged.

```sh
npm run dev:login
npm run dev:sync
```

- `dev:login` asks in an interactive terminal for a Gladys admin email/password
  with hidden input. It saves only a refresh session, not the password, and does
  **not** install or start anything.
- `dev:sync` builds the runtime and installs its **own** developer registration.
  Subsequent calls rebuild and update that registration even when only source
  code, not the manifest, changed. Gladys recreates the container and issues its
  token. Registration, devices and config are retained.
- The private receipt records the **actual** returned selector and installed
  image reference. `dev:prepare` also uses that image on later builds because
  Gladys updates the installed reference, even if the manifest's tag changes.
  A tag change is not an automatic migration. Never delete a registration just
  to change its tag.
- The helper refuses foreign registrations/images or a different Gladys origin.
  An unrecorded installation must be inspected, not automatically adopted.
  After a failed/ambiguous install, inspect Gladys before retrying.

The helper stores ignored `data/dev-session.json` and
`data/dev-registration.json` with mode 600 in a directory with mode 700. Keep
the receipt; do not copy another integration's registration, tokens or session.
These files use filesystem permissions, not encryption. Never paste them into
issues, screenshots or chats. They are not mounted into the runtime container.

## Optional controller diagnostics

Prefer entering the controller settings directly in Gladys. If a separate
read-only diagnostic is needed:

```sh
npm run setup:controller
npm run check:controller
npm run dev:configure
```

Setup runs interactively, saves ignored `data/controller.json` (600, directory
700), does not contact the controller and refuses to overwrite an existing file.
Edit that file locally for changes. The check reads configuration and prints
only aggregate counts. `dev:configure` validates access read-only, then copies
those settings to the recorded registration through the official Gladys admin
configuration API. It neither extracts an integration token nor operates devices.

## Runtime and debugging

Use Gladys' supervision controls for container status, restart and logs. The
runtime needs only its packaged code, dependencies and injected SDK environment.
It has no dependency on a checkout path, host Node executable, `data/` or `.env`.
It keeps no local persistent files. On an unprivileged native development host,
Gladys' `/data` bind mount may not be writable by uid 1000; the integration does
not require that mount for its current stateless runtime. Do not run it as root
or modify Core to hide this development-host limitation.

If the container cannot reach the controller, check the configured address,
DNS, LAN routing/firewall and certificate trust **from the container**, not only
from the host. Do not substitute `localhost` for the actual controller address:
inside Docker it means the integration container. Do not disable TLS checking.

`npm start` and `.env.example` remain only for deliberate SDK debugging with
the exact credentials of a dedicated developer registration. They are not an
installation or autostart method. Never run a second SDK process under an
identity whose container is already running. No helper writes `.env` or installs
an operating-system service.

Tests use injected provider requests or synthetic loopback servers. Physical
device operations need explicit authorization. Building and testing do not
authorize pushing, publishing images, releases or a Store listing.
