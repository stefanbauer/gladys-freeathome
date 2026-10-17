import { logger } from '@gladysassistant/integration-sdk';
import { FreeAtHomeController } from './controller.js';
import { buildCatalog, readUpdates, encodeCommand } from './catalog.js';

const failed = {
  en: 'Local controller unavailable. Check the API address, credentials and TLS trust.',
  fr: 'Contrôleur local indisponible. Vérifiez l’adresse API, les identifiants et le certificat.',
  de: 'Lokaler Controller nicht erreichbar. API-Adresse, Zugangsdaten und TLS-Vertrauen prüfen.',
};
const connected = {
  en: 'Connected to the local REST and WebSocket API.',
  fr: 'Connecté aux API REST et WebSocket locales.',
  de: 'Mit der lokalen REST- und WebSocket-API verbunden.',
};

export function registerHandlers(gladys, options = {}) {
  let session;

  function stop() {
    const previous = session;
    session = undefined;
    previous?.unsubscribe?.();
  }
  const current = (s) => s === session && gladys.connected;
  const owned = (id) => gladys.devices.some((d) => d.external_id === id);
  async function publishStates(s, states) {
    if (!current(s)) return;
    const features = new Set(gladys.devices.flatMap((d) => d.features.map((f) => f.external_id)));
    await gladys.publishChangedStates(
      states.filter((v) => features.has(v.device_feature_external_id)),
    );
  }
  async function refresh(s) {
    // Serialize scans, polls and config-dirty refreshes; do not let an older
    // response replace a newer channel catalogue.
    const task = s.refresh.then(async () => {
      const configuration = await s.controller.getConfiguration();
      if (!current(s)) return;
      s.catalog = buildCatalog(gladys, configuration);
      await gladys.publishDiscoveredDevices(s.catalog.devices);
      await publishStates(s, s.catalog.states);
    });
    s.refresh = task.catch(() => {});
    return task;
  }
  async function unavailable(s) {
    s.generation += 1;
    s.ready = false;
    if (current(s)) await gladys.setConnectionStatus(false, failed);
  }
  async function initialize() {
    stop();
    let s;
    try {
      s = {
        controller: new FreeAtHomeController(gladys.config, options),
        refresh: Promise.resolve(),
        ready: false,
        generation: 0,
      };
      session = s;
      await unavailable(s);
      if (!current(s)) return;
      s.unsubscribe = s.controller.subscribe(
        {
          onConnect: async () => {
            const generation = ++s.generation;
            await refresh(s);
            if (!current(s) || generation !== s.generation) return;
            s.ready = true;
            await gladys.setConnectionStatus(true, connected);
          },
          onEvent: async (payload, eventOptions) => {
            if (!current(s)) return;
            const update = readUpdates(s.catalog, payload, eventOptions);
            // Config-only messages do not masquerade as presses. Refresh first
            // so removed/reassigned datapoints cannot retain command authority.
            if (update.configurationChanged) {
              const generation = s.generation;
              s.ready = false;
              await refresh(s);
              if (current(s) && generation === s.generation) s.ready = true;
              return;
            }
            await publishStates(s, update.states);
            for (const event of update.events) {
              if (!current(s) || !owned(event.device)) continue;
              await gladys.publishSceneEvent('button_action', {
                device: event.device,
                action: event.action,
              });
              await publishStates(s, [
                { device_feature_external_id: event.feature, text: event.action },
              ]);
            }
          },
          onDisconnect: () => {
            void unavailable(s).catch(() => {});
          },
          onError: () => {
            logger.warn('free@home synchronization failed; no automatic command retry.');
          },
        },
        options,
      );
    } catch {
      if (s && !current(s)) return;
      if (s) await unavailable(s);
      else await gladys.setConnectionStatus(false, failed);
      logger.warn('free@home initialization failed. Check local API configuration.');
    }
  }

  gladys.on('connected', initialize);
  gladys.on('disconnected', stop);
  gladys.onConfigUpdated(initialize);
  gladys.onScanRequest(async () => {
    if (!session) throw new Error('Configure the local controller first.');
    await refresh(session);
  });
  gladys.onPoll(async (device) => {
    if (!session || !owned(device.external_id)) throw new Error('Unknown device.');
    await refresh(session);
  });
  gladys.onDeviceCreated(async () => {
    if (session) await refresh(session);
  });
  gladys.onDeviceUpdated(async () => {
    if (session) await refresh(session);
  });
  gladys.onAction('test_connection', async () => {
    await new FreeAtHomeController(gladys.config, options).getConfiguration();
    return {
      en: 'Local REST API accessible (read-only test).',
      fr: 'API REST locale accessible (test en lecture seule).',
      de: 'Lokale REST-API erreichbar (rein lesender Test).',
    };
  });
  gladys.onSetValue(async (device, feature, value) => {
    const s = session;
    if (!s?.ready || !current(s)) throw new Error('Local controller is disconnected.');
    const binding = s.catalog.features.get(feature.external_id);
    const created = gladys.devices.find((d) => d.external_id === device.external_id);
    if (
      !binding ||
      binding.device !== device.external_id ||
      !created?.features.some((f) => f.external_id === feature.external_id)
    )
      throw new Error('Unknown or unowned device feature.');
    const command = encodeCommand(binding, value);
    const signal = AbortSignal.timeout(4000); // One deadline within Gladys' 5s ack window.
    if (command.checkMovement) {
      const movement = String(await s.controller.getDatapoint(command.checkMovement, { signal }));
      if (movement === '0' || movement === '1') return; // ABB stop is also step: never step an idle blind.
      if (movement !== '2' && movement !== '3')
        throw new Error('Cannot establish blind movement safely.');
    }
    if (!current(s) || !s.ready || signal.aborted)
      throw new Error('Connection changed before command.');
    await s.controller.setDatapoint(command.target, command.value, { signal });
    // The PUT ack is not device feedback. Publish only real reported states.
  });
  return stop;
}
