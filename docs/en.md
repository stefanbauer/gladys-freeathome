# free@home for Gladys

An independent integration using ABB/Busch-Jaeger's local REST and WebSocket API,
without XMPP or a cloud connection. It implements switched consumers, dimmable
lights, blinds/shutters and wall/panel button actions for Gladys scenes.

## Setup

The integration runs in its own **Linux Docker container supervised by Gladys**.
Gladys manages startup, restart, logs and integration credentials. Users need no
macOS, host Node.js, source checkout or `.env`. No image or Store listing has
been published yet. For private testing, install a locally built image in Gladys
developer mode; see the separate [development guide](development.md).

Use Gladys 5.1.0+ with Docker, a compatible SysAP with its local API enabled, the controller
origin including `http://` or `https://`, the API username shown in free@home next
and its password. Enter both credentials in Gladys' Configuration secret fields, separate from this
integration's own Gladys token. Never share credentials or raw configuration.

Save settings and check connection status. The test button checks REST access
only; the ongoing status also confirms the WebSocket connection. Discovery lists
supported channels. Create the ones you need and assign rooms yourself. One
physical multichannel actuator can have several entries. The integration does
not create or delete user devices automatically.

Equally named channels on one device get an API channel suffix in discovery,
such as `Double button [ch0000]` and `[ch0003]`. This does not mean upper/lower:
REST supplies no physical mapping, and a rocker may send multiple actions on one
channel. Existing devices keep their user-owned names; rename them in Gladys if
needed.

## Controls and button events

Opening and slat opening are **0% closed, 100% open**. Slats appear only with
matching datapoints, as a separate percentage slider, not calibrated degrees.
Up/down/stop use actuator feedback; some actuators report position only when
movement finishes. Stop first reads movement: idle is a no-op and unknown
movement is rejected. ABB's stop also steps an idle blind, so an actuator stopping
between that read and write remains a non-atomic protocol race. Zero brightness
uses the separate binary off command.

Create a button channel first, then choose **Integrations → free@home → Button
action** in the scene editor. Select the button; an empty action filter matches
any of its actions. Depending on button configuration, actions include on/off,
dim up/down/stop, open/close and stop/step up/down. Equal live telegrams remain
separate events. The last-action display is a state, not a press trigger.
Telegram semantics are not a universal raw press/release or double-click API.
Snapshots and initial synchronization never trigger scenes. Events during
disconnection/resync are lost, not replayed; there is no reliable replay marker
for an exactly-once guarantee.

## Security and development status

Prefer HTTPS with a trusted certificate. A private CA can be supplied using
`NODE_EXTRA_CA_CERTS`; never disable TLS checks. Basic auth over HTTP is not
encrypted. Never expose the controller API to the Internet. Commands are never
automatically retried, including after reconnect: a lost acknowledgement does
not prove that a command failed to execute.

Alongside synthetic tests, explicitly authorized firmware 3.5.3 hardware checks
verified a switched light, blind positioning, up/stop, repeated identical button
scene events and restart/reconnection. A subsequent manual test confirmed dimming
at 31% and 73% with matching feedback and off at 0%. Slats, the other button side and
the separate down command have not been checked on real hardware. Groups,
virtual devices, free@home scenes, HVAC and other sensors are outside this scope.
No Store listing or release exists.

## Operation and updates

Use Gladys' supervision controls for start/stop, restart, logs and updates. The
Gladys/Docker host must be running; a developer's computer is not required.
Use update, not uninstall/reinstall, to retain registration, configuration and
devices: uninstalling in Gladys deletes them. The image contains no personal
credentials. Runtime config comes from Gladys; no persistent local files are
required.
