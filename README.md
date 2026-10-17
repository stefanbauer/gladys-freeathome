# free@home for Gladys Assistant

Private, standalone external integration using the official Gladys JavaScript
SDK and ABB's **local REST + WebSocket API**. No XMPP, cloud API, virtual-device
registration or changes to the free@home installation.

## Implemented scope

- Switch outputs for lights **or other consumers**, with real on/off feedback.
- Dimmable lights, including explicit off when brightness is set to zero.
- Blinds/shutters: up, down, stop and absolute opening percentage. Slat opening
  is offered only when the channel advertises the corresponding datapoints.
- Wall/panel switch, dimming, blind and staircase-light buttons: live actions
  as a `button_action` scene trigger, plus a read-only last-action display.
- Discovery per channel, stable hashed identifiers, user-owned device lifecycle,
  state-change deduplication, reconnect/backoff/heartbeat and snapshot resync.

Only recognized function IDs with relevant pairing IDs are exposed. Groups,
free@home scenes, virtual devices, HVAC and other sensor classes are not mapped.
This is **not** a claim that every vendor device or firmware has been tested.
On firmware 3.5.3, explicitly authorized hardware checks verified a switched light,
absolute blind positioning, upward movement and stop, repeated identical button
scene events, process restart and controller reconnection. Dimming, slats, the
other side of the tested button and the separate downward command remain
**synthetic-test coverage only**. The repository is not published or listed in the Store.

## Requirements

- Node.js **24**; `nvm use` if nvm is available. Install with `npm ci`.
- Gladys **5.1.0+**, including external-integration scene triggers.
- A SysAP with the official local API enabled (ABB documents SysAP 2.0,
  firmware 2.6.0+), reachable from the integration process/container.
- Local API username from **free@home next → More → free@home Settings → Local API**
  and its password. This may differ from the normal display name.

Prefer HTTPS with a trusted certificate. Private CAs can be supplied through
`NODE_EXTRA_CA_CERTS`; the certificate file must also be accessible in Docker.
TLS verification is never disabled. Basic auth over HTTP is **not encrypted**:
use HTTP only consciously on a trusted LAN. Never expose the API to the Internet.

## Local development on the Mac

Gladys runs separately in `../gladys`, API port **1443**, frontend port **1444**.
Core and `../gladys-ff-agent` remain unchanged. This integration has its **own**
registration, tokens and native process. Never borrow another integration's
credentials. Do not start a second SDK process under the same identity.

### 1. Store and check controller access

```sh
nvm use
npm ci
npm run setup:controller
npm run check:controller
```

Run setup in an interactive Mac terminal. It asks for the controller origin
(including `http://` or `https://`); username and password are hidden. It makes
no network request, refuses to overwrite an existing file, and saves ignored
`data/controller.json` with mode **600** inside a **700** directory. For later
changes edit that file locally. The check only reads configuration and prints
aggregate counts, never names, IDs, addresses or credentials.

These are plaintext local files protected by permissions, **not encryption**.
Never paste their contents, raw API responses or tokens into chat/issues.

### 2. Register this integration with local Gladys

```sh
npm run dev:login
npm run dev:configure
npm start
```

`dev:login` asks for the **local Gladys admin** email and password (both hidden).
It stores only its own refresh session in ignored `data/dev-session.json`,
builds an idle development image, installs it through the supported local-image
developer API, records its returned selector, and writes `.env` with its own
integration token. Private files use mode 600. No admin password is saved.

`dev:configure` reads the existing private controller file, validates it read-only,
and copies those settings **only to this integration's** Gladys configuration.
Alternatively enter the settings in Gladys' generated Configuration tab.
`npm start` runs the actual SDK process natively. Its controller subscription only
reads until a user explicitly sends an actuator command from Gladys.

The development-only image `gladys-freeathome-host-dev:0.1.0` is an idle registration
container, **not the integration runtime**. Its embedded manifest is synchronized
by `npm run dev:sync` after manifest changes. `dev:connect` refreshes `.env` from
the recorded, verified container. `dev:prepare` only builds the idle image.
Helpers refuse non-loopback Gladys instances, foreign registrations/images and
an `.env` belonging to another selector. If a registration succeeds but its local
receipt is lost, inspect Gladys rather than blindly reinstalling.

The default selector is derived by Gladys from `free@home` (`ext-dev-freehome`,
possibly with a collision suffix); the helper uses the actual returned selector.
Do not infer it from the repository name.

### 3. Discover devices and configure scenes

Open this integration in Gladys on the Mac's frontend port **1444**. Discovery
offers supported **channels**, not just one entry per physical actuator. Create
only the channels you need, assign rooms and names there. The integration never
creates/deletes user devices itself. Only created features receive states and
only created, owned actuator features accept commands.

For a button, first create its channel. In the scene editor choose
**Integrations → free@home → Button action**, select that button and optionally
an action. Leaving the action empty matches any action from that button.
`device` and `action` are also available to subsequent scene actions.
Do not use last-action state changes as a press trigger: two equal presses
must fire twice, while a state display deliberately deduplicates equal values.

### 4. Native macOS autostart

For this private Mac setup, a **user LaunchAgent** supervises the same native SDK
process. It reuses this checkout's registration and protected `.env`; it does not
register a second integration or put tokens into the plist. Stop only this
checkout's manually running `npm start` before installation. The helper refuses
to install alongside a native runtime or to modify another checkout's LaunchAgent.

```sh
nvm use
npm run service:install
npm run service:status
npm run service:restart
```

The job is `com.gladysassistant.freeathome`, under the current user's
`~/Library/LaunchAgents`. It starts at **user login**, restarts after process exit
with a 15-second restart throttle, and writes private logs to `data/runtime.log`.
Status reports the launchd job/PID, **not** controller connectivity; check the
connection badge in Gladys as well. Install is idempotent. Automatic respawn,
explicit restart, uninstall/reinstall and preservation of devices/states were
verified on the real local stack without issuing device commands.

This is not a system daemon or a 24/7 server setup: it does not run while logged
out or asleep, and it does **not** start Gladys or Docker. Their startup remains
separate; launchd keeps retrying this process if Gladys is unavailable. The Node
executable and checkout path are fixed at installation. After moving the checkout
or removing/upgrading that Node installation, uninstall from the original
checkout and reinstall with Node 24 before removing the old paths.

To disable autostart and stop the managed process before manual development:

```sh
npm run service:uninstall
npm start
```

Uninstall removes only this LaunchAgent, not its Gladys registration, credentials,
devices or logs. Never run `npm start` alongside the loaded LaunchAgent. The
container runtime below remains the intended packaging for a future dedicated
Gladys host; no migration or publication is performed by these commands.

## Device semantics and limits

- **Opening and slat opening: 0% closed, 100% open.** ABB percentages are inverted
  in both command and feedback directions. Slats are a separate named slider;
  the API provides percentage, **not calibrated degrees**. An actuator without
  slat datapoints gets no slat control.
- Movement uses Gladys values open `1`, stop `0`, close `-1`. Feedback comes from
  the actuator, never an optimistic command echo. Position may update only when
  movement finishes, depending on the actuator.
- ABB's stop datapoint is **also a step command**. The integration reads current
  movement before stopping; idle is a no-op and unknown movement is rejected.
  The read/write pair is not atomic: an actuator stopping between them remains
  a protocol-level race. A missing stop/feedback datapoint is rejected safely.
- 0% brightness sends binary off; without a binary input, brightness commands
  start at 1%. Brightness feedback can retain the last level while switched off.
- Taster actions are telegram semantics (`on`, `off`, `dim_up`, `dim_down`,
  `dim_stop`, `open`, `close`, `stop_up`, `stop_down`), not a universal raw
  press/release or double-click API. What is emitted depends on button configuration.
- Initial/reconnect REST snapshots, startup-buffered frames and configuration
  telegrams do **not** trigger scenes. Equal live telegrams remain separate
  events. Events during disconnect/resync are not replayed; ABB supplies no
  reliable event identifier/replay flag for an exactly-once guarantee.
- Commands have a single 4-second HTTP deadline within Gladys' 5-second ack
  window and are **never automatically retried**, including after reconnect.
  A lost response can mean a command executed: check feedback before repeating.
- Gladys limits states and scene events independently to **300/minute**. State
  changes use the SDK's deduplication/batching; button events are never deduplicated.

## Verification and local runtime image

```sh
npm test
npm run lint
npm run format:check
docker build -t gladys-freeathome-dev:0.1.0 .
```

Tests use the official SDK fake and an authenticated synthetic HTTP/WebSocket
server. They cover asymmetric positions, actual pairing-ID resolution, command
validation/ownership, safe idle-stop behavior, duplicate button events and
reconnect. No test calls the real installation.

The **runtime** image runs as `node` with `dumb-init`, supports a read-only root
filesystem and writes only under `/data`. Its build context excludes credentials,
local data and tests. Install this runtime image with the manifest in Gladys
developer mode for a separate containerized test, **not alongside the native
process using the same registration**. No registry or publishing workflow exists.

## References

- [Official Gladys integration documentation](https://gladysassistant.com/docs/dev/external-integrations/)
- [Official JavaScript template](https://github.com/GladysAssistant/integration-template-js)
- [Official SDK](https://github.com/GladysAssistant/integration-sdk-js)
- Living Core contracts: `../gladys/docs/specs/external-integrations/`
- [ABB prerequisites](https://developer.eu.mybuildings.abb.com/fah_local/prerequisites),
  [examples](https://developer.eu.mybuildings.abb.com/fah_local/samples),
  [data model / WebSocket](https://developer.eu.mybuildings.abb.com/fah_local/concepts)
- [Official function/pairing enums](https://github.com/Busch-Jaeger/node-free-at-home)
- [English](docs/en.md), [Français](docs/fr.md), [Deutsch](docs/de.md)

`jheling/freeathome` and `kingsleyadam/local-abbfreeathome` informed protocol research;
no Home Assistant code was copied. Pushes, PRs, publication and releases require
new approval. The repository remains private and has no Store-discovery topic.
