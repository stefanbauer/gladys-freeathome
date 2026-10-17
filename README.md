# free@home for Gladys Assistant

![Independent free@home integration artwork](cover.png)

Standalone external integration using the official Gladys JavaScript
SDK and ABB's **local REST + WebSocket API**. No XMPP, cloud API, virtual-device
registration or changes to the free@home installation.

Independent community project, not an official ABB/Busch-Jaeger product.
The [cover artwork and publication notes](docs/artwork.md) describe the asset's
format, origin and pending catalog URL.

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
**synthetic-test coverage only**. Source code is public; no Store listing exists.

## Requirements

- Gladys **5.1.0+** with Docker and external-integration scene triggers.
- A SysAP with the official local API enabled (ABB documents SysAP 2.0,
  firmware 2.6.0+), reachable from the integration container.
- Local API username from **free@home next → More → free@home Settings → Local API**
  and its password. This may differ from the normal display name.

Prefer HTTPS with a trusted certificate. Private CAs can be supplied through
`NODE_EXTRA_CA_CERTS`; the certificate file must also be accessible in Docker.
TLS verification is never disabled. Basic auth over HTTP is **not encrypted**:
use HTTP only consciously on a trusted LAN. Never expose the API to the Internet.

## Installation and operation

The integration runs **inside its own Linux Docker container, supervised by
Gladys**. Users configure it in Gladys, not in a terminal. No macOS service,
native Node installation, source checkout, `.env` or developer login is needed
on the user's machine. Gladys injects the SDK URL, selector and integration
token; the runtime obtains controller settings from Gladys. No controller
address, credentials or device identifiers are built into the image.

**Current availability:** there is no published image or Store listing yet.
For a private test, build the image on the Docker daemon used by Gladys and
install it using Gladys' **developer mode → install from a Docker image**.
Use `gladys-freeathome-dev:0.1.0` and the supplied
`gladys-assistant-integration.json`. See the separate
[development guide](docs/development.md) for building and iterating. A future
public release must provide a pullable, versioned image before Store installation
can be offered; these instructions do not imply that publication has happened.

In this integration's **Configuration** tab, enter the SysAP origin (including
`http://` or `https://`), local API username and password. The credentials are
Gladys secret fields, separate from the integration token. Save and check the
connection status: the test action checks REST access only; a connected status
also confirms the WebSocket subscription. Startup, discovery and configuration
tests do not operate devices or change the free@home installation.

Discovery offers supported **channels**, not just one entry per actuator. Create
only the channels you need, assign rooms and names there. The integration never
creates/deletes user devices itself. Only created features receive states and
only created, owned actuator features accept commands.

Equally named channels on the same physical device get their API channel address
appended in discovery, for example `Double button [ch0000]` and
`Double button [ch0003]`. This is not an upper/lower label: the REST API does not
provide that physical mapping, and a rocker can send multiple actions on one
channel. Existing user-created device names are not overwritten; rename them
in Gladys if desired.

For a button, first create its channel. In the scene editor choose
**Integrations → free@home → Button action**, select that button and optionally
an action. Leaving the action empty matches any action from that button.
`device` and `action` are also available to subsequent scene actions.
Do not use last-action state changes as a press trigger: two equal presses
must fire twice, while a state display deliberately deduplicates equal values.

Start, stop, restart, logs and updates belong to Gladys' supervision controls.
Use **update**, not uninstall/reinstall, to retain registration, devices and
configuration. Uninstall in Gladys deletes them. The host running Gladys/Docker
must be available for operation; this does not depend on a developer's laptop.

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

## Verification

```sh
npm test
npm run lint
npm run format:check
```

Tests use the official SDK fake and an authenticated synthetic HTTP/WebSocket
server. They cover asymmetric positions, actual pairing-ID resolution, command
validation/ownership, safe idle-stop behavior, duplicate button events and
reconnect. No test calls the real installation.

The image runs as `node` with `dumb-init` and supports Gladys' read-only root
filesystem with no Linux capabilities. It requires no local persistence: config
comes from Gladys, logs go to stdout/stderr. Build context excludes credentials,
local data and developer/test scripts. Runtime tests passed inside
`linux/arm64` and emulated `linux/amd64` containers. The Gladys-managed arm64
container was also checked against the real SysAP, including restart and
preservation of the existing four devices, their settings and states. No new
actuator commands were sent for that container migration check. An actual amd64
Gladys host and a multi-architecture published image have not been verified.

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
no Home Assistant code was copied. Further pushes, PRs, image publication and
releases require new approval. No Store-discovery topic is set.
