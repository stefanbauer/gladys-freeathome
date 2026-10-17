# free@home for Gladys

An independent integration using ABB/Busch-Jaeger's local REST and WebSocket API,
without XMPP or a cloud connection. It implements switched consumers, dimmable
lights, blinds/shutters and wall/panel button actions for Gladys scenes.

## Setup

Use Gladys 5.1.0+, a compatible SysAP with its local API enabled, the controller
origin including `http://` or `https://`, the API username shown in free@home next
and its password. Both API credentials are secret fields, separate from this
integration's own Gladys token. Never share credentials or raw configuration.

Save settings and check connection status. The test button checks REST access
only; the ongoing status also confirms the WebSocket connection. Discovery lists
supported channels. Create the ones you need and assign rooms yourself. One
physical multichannel actuator can have several entries. The integration does
not create or delete user devices automatically.

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
scene events and restart/reconnection. Dimming, slats, the other button side and
the separate down command have not been checked on real hardware. Groups,
virtual devices, free@home scenes, HVAC and other sensors are outside this scope.
No Store listing or release exists.

## Mac autostart

After setting up this integration's own local registration, stop its manual
runtime and run `npm run service:install`. A dedicated user LaunchAgent starts it
at login and restarts it after exit. Use `npm run service:status`,
`npm run service:restart` or `npm run service:uninstall` to inspect, restart or
remove it. Uninstall preserves registration and devices. Private logs live in
`data/runtime.log`; credentials stay in `.env`, never in the plist. Do not also
run `npm start` while the agent is loaded.

Gladys and Docker still need separate startup. This is not a 24/7 system daemon:
the integration does not run while logged out or asleep. Uninstall from the old
checkout and reinstall after changing its path or the installed Node executable.
See the [README](../README.md#4-native-macos-autostart) for details and secure setup.
