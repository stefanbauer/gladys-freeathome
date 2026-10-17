import { createHash } from 'node:crypto';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';

// Vendor function IDs are hexadecimal, pairing IDs are decimal. Never infer
// semantics from a channel name, floorplan placement or an idp/odp suffix.
const SWITCHES = new Set([0x7, 0xf0, 0x1808, 0x1809, 0x180a, 0x1830, 0x1831, 0x1832]);
const DIMMERS = new Set([0x12, 0x1810, 0x1811, 0x1812, 0x1818, 0x1819]);
const COVERS = new Set([
  0x9, 0x2c, 0x61, 0x62, 0x63, 0x1820, 0x1821, 0x1822, 0x1823, 0x1825, 0x1828,
]);
const SENSORS = new Map([
  [0x0, [1]],
  [0x1, [1, 16]],
  [0x2, [32, 33]],
  [0x3, [32, 33]],
  [0x4, [2]],
  [0x30, [1]],
  [0x31, [1, 16]],
  [0x32, [32, 33]],
  [0x33, [32, 33]],
]);

function numeric(value, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function buttonAction(pairing, raw) {
  const value = numeric(raw, 0, 15);
  if (!Number.isInteger(value)) return null;
  if (pairing === 1 || pairing === 2) return ['off', 'on'][value] || null;
  if (pairing === 32) return ['open', 'close'][value] || null;
  if (pairing === 33) return ['stop_up', 'stop_down'][value] || null;
  if (pairing === 16) {
    if ((value & 7) === 0) return 'dim_stop';
    return value & 8 ? 'dim_up' : 'dim_down';
  }
  return null;
}

export function buildCatalog(gladys, configuration) {
  const catalog = {
    devices: [],
    features: new Map(),
    feedback: new Map(),
    buttons: new Map(),
    states: [],
  };
  for (const [system, model] of Object.entries(configuration)) {
    for (const [serial, device] of Object.entries(model.devices)) {
      if (device.interface?.startsWith('vdev:')) continue;
      for (const [channelId, channel] of Object.entries(device.channels || {})) {
        const functionText = String(channel.functionID ?? '');
        if (!/^[0-9a-f]+$/i.test(functionText)) continue;
        const fn = parseInt(functionText, 16);
        const input = new Map(
          Object.entries(channel.inputs || {}).map(([id, dp]) => [Number(dp.pairingID), id]),
        );
        const output = new Map(
          Object.entries(channel.outputs || {}).map(([id, dp]) => [Number(dp.pairingID), id]),
        );
        const stableId = createHash('sha256')
          .update(JSON.stringify([system, serial, channelId]))
          .digest('hex');
        const ids = gladys.externalIds('channel', stableId);
        const discovered = {
          name: channel.displayName || device.displayName || 'free@home',
          external_id: ids.device,
          features: [],
          params: [{ name: 'GLADYS_TRANSPORT', value: 'local' }],
        };
        const target = (point) => ({ system, serial, channel: channelId, point });
        const key = (point) => `${system}/${serial}/${channelId}/${point}`;
        function feature(
          name,
          suffix,
          category,
          type,
          min,
          max,
          writePair,
          readPair,
          decode,
          unit,
        ) {
          const write = input.get(writePair);
          const read = output.get(readPair);
          if (!write && !read) return;
          const value = {
            name,
            external_id: ids.feature(suffix),
            category,
            type,
            min,
            max,
            read_only: !write,
            has_feedback: !!read,
            keep_history: false,
            ...(unit ? { unit } : {}),
          };
          discovered.features.push(value);
          const binding = {
            device: ids.device,
            feature: value,
            write: write && target(write),
            read: read && target(read),
            decode,
            suffix,
          };
          if (suffix === 'movement') {
            binding.stop = input.get(33) && target(input.get(33));
          }
          if (suffix === 'brightness') binding.off = input.get(1) && target(input.get(1));
          catalog.features.set(value.external_id, binding);
          if (read) {
            catalog.feedback.set(key(read), binding);
            const state = decode(channel.outputs[read].value);
            if (state !== null)
              catalog.states.push({ device_feature_external_id: value.external_id, state });
          }
        }
        if (SWITCHES.has(fn) || DIMMERS.has(fn)) {
          const light = DIMMERS.has(fn);
          feature(
            'On / Off',
            'binary',
            light ? C.LIGHT : C.SWITCH,
            light ? T.LIGHT.BINARY : T.SWITCH.BINARY,
            0,
            1,
            1,
            256,
            (v) => {
              const n = numeric(v, 0, 1);
              return Number.isInteger(n) ? n : null;
            },
          );
          if (light)
            feature(
              'Brightness',
              'brightness',
              C.LIGHT,
              T.LIGHT.BRIGHTNESS,
              input.has(1) ? 0 : 1,
              100,
              17,
              272,
              (v) => numeric(v, 0, 100),
              U.PERCENT,
            );
        } else if (COVERS.has(fn)) {
          feature(
            'Open / Stop / Close',
            'movement',
            C.SHUTTER,
            T.SHUTTER.STATE,
            -1,
            1,
            32,
            288,
            (v) => {
              const n = numeric(v, 0, 3);
              return Number.isInteger(n) ? (n === 2 ? 1 : n === 3 ? -1 : 0) : null;
            },
          );
          // Expose opening percentage: 0 closed, 100 open. ABB uses the inverse.
          feature(
            'Opening',
            'position',
            C.SHUTTER,
            T.SHUTTER.POSITION,
            0,
            100,
            35,
            289,
            (v) => {
              const n = numeric(v, 0, 100);
              return n === null ? null : 100 - n;
            },
            U.PERCENT,
          );
          feature(
            'Slat opening',
            'tilt',
            C.SHUTTER,
            T.SHUTTER.POSITION,
            0,
            100,
            36,
            290,
            (v) => {
              const n = numeric(v, 0, 100);
              return n === null ? null : 100 - n;
            },
            U.PERCENT,
          );
        } else if (SENSORS.has(fn)) {
          const actionPoints = SENSORS.get(fn).filter((pair) => output.has(pair));
          if (actionPoints.length) {
            discovered.features.push({
              name: 'Last button action',
              external_id: ids.feature('action'),
              category: C.TEXT,
              type: T.TEXT.TEXT,
              min: 0,
              max: 0,
              read_only: true,
              has_feedback: false,
              keep_history: false,
            });
            for (const pair of actionPoints)
              catalog.buttons.set(key(output.get(pair)), {
                device: ids.device,
                feature: ids.feature('action'),
                decode: (v) => buttonAction(pair, v),
              });
          }
        }
        if (discovered.features.length) catalog.devices.push(discovered);
      }
    }
  }
  return catalog;
}

export function readUpdates(catalog, payload, { live = true } = {}) {
  const states = [];
  const events = [];
  let configurationChanged = false;
  for (const [system, update] of Object.entries(payload)) {
    if (!update || typeof update !== 'object') continue;
    if (
      update.configDirty === true ||
      update.configDirty === 'true' ||
      Object.keys(update.devices || {}).length ||
      update.devicesAdded?.length ||
      update.devicesRemoved?.length
    )
      configurationChanged = true;
    for (const [path, raw] of Object.entries(update.datapoints || {})) {
      const key = `${system}/${path}`;
      const binding = catalog.feedback.get(key);
      if (binding) {
        const state = binding.decode(raw);
        if (state !== null)
          states.push({ device_feature_external_id: binding.feature.external_id, state });
      }
      const button = live && catalog.buttons.get(key);
      if (button) {
        const action = button.decode(raw);
        if (action) events.push({ device: button.device, feature: button.feature, action });
      }
    }
  }
  return { states, events, configurationChanged };
}

export function encodeCommand(binding, value) {
  if (!binding.write || binding.feature.read_only) throw new Error('This feature is read-only.');
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < binding.feature.min ||
    value > binding.feature.max
  )
    throw new Error('Invalid command value.');
  if (binding.suffix === 'binary' && ![0, 1].includes(value)) throw new Error('Expected on/off.');
  // ABB documents off separately from absolute dimming. A 0% slider gesture
  // must not leave a lamp on at its minimum brightness.
  if (binding.suffix === 'brightness' && value === 0) return { target: binding.off, value: '0' };
  if (binding.suffix === 'movement') {
    if (![-1, 0, 1].includes(value)) throw new Error('Expected open, stop or close.');
    if (value === 0) {
      if (!binding.stop || !binding.read)
        throw new Error('Safe stop is not supported by this actuator.');
      return { target: binding.stop, value: '0', checkMovement: binding.read };
    }
    return { target: binding.write, value: value === 1 ? '0' : '1' };
  }
  return {
    target: binding.write,
    value: String(binding.suffix === 'position' || binding.suffix === 'tilt' ? 100 - value : value),
  };
}
