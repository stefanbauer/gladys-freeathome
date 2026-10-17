import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';

const fixture = JSON.parse(await readFile(new URL('fixtures/configuration.json', import.meta.url)));
const credentials = { api_username: 'synthetic-user', api_password: 'synthetic-password' };

async function until(check) {
  for (let i = 0; i < 250; i += 1) {
    if (check()) return;
    await delay(10);
  }
  assert.fail('Expected observable result did not arrive.');
}

async function setup(t, { configurationFailures = 0 } = {}) {
  const state = {
    configuration: structuredClone(fixture),
    writes: [],
    sockets: [],
    status: 200,
    movement: '3',
    configurationFailures,
    initialFrame: false,
    dropResponse: false,
  };
  const server = createServer(async (req, res) => {
    if (
      req.headers.authorization !==
      `Basic ${Buffer.from(`${credentials.api_username}:${credentials.api_password}`).toString('base64')}`
    ) {
      res.writeHead(401).end();
      return;
    }
    if (state.status !== 200) {
      res.writeHead(state.status).end('private-response');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/fhapi/v1/api/rest/configuration') {
      if (state.configurationFailures-- > 0) return res.writeHead(503).end('private-response');
      return res.end(JSON.stringify(state.configuration));
    }
    if (req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      state.writes.push({ path: req.url, body });
      if (state.dropResponse) return req.socket.destroy();
      return res.end('{"synthetic-system":{"result":"OK"}}');
    }
    res.end(JSON.stringify({ 'synthetic-system': { values: [state.movement] } }));
  });
  const ws = new WebSocketServer({
    server,
    path: '/fhapi/v1/api/ws',
    verifyClient: ({ req }) =>
      req.headers.authorization ===
      `Basic ${Buffer.from(`${credentials.api_username}:${credentials.api_password}`).toString('base64')}`,
  });
  ws.on('connection', (socket) => {
    state.sockets.push(socket);
    if (state.initialFrame)
      socket.send(
        JSON.stringify({ 'synthetic-system': { datapoints: { 'SYNTHETIC/ch0003/odp0005': '1' } } }),
      );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const gladys = createFakeGladys({
    config: { ...credentials, controller_url: `http://127.0.0.1:${server.address().port}` },
  });
  const stop = registerHandlers(gladys, { reconnectMs: 10 });
  t.after(async () => {
    stop();
    await gladys.disconnect();
    for (const socket of ws.clients) socket.terminate();
    await new Promise((resolve) => ws.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  await gladys.connect();
  await until(() => gladys.fake.connectionStatus?.connected);
  const devices = gladys.fake.discoveredDevices;
  const device = (name) => devices.find((d) => d.name === name);
  const feature = (name, suffix) =>
    device(name).features.find((f) => f.external_id.endsWith(`:${suffix}`));
  const command = (name, suffix, value) =>
    gladys.fake.setValue(device(name), feature(name, suffix), value);
  const send = (datapoints, extra = {}) =>
    state.sockets.at(-1).send(JSON.stringify({ 'synthetic-system': { datapoints, ...extra } }));
  async function createAll() {
    for (const d of devices) await gladys.fake.deviceCreated(d);
  }
  return { state, gladys, devices, device, feature, command, send, createAll };
}

test('SDK discovery and feedback expose only supported channels; states require user-created features', async (t) => {
  const { gladys, devices, state, feature, send, createAll } = await setup(t);
  assert.deepEqual(
    devices.map((d) => d.name),
    [
      'Switched consumer',
      'Dimmable light',
      'Blind with slats',
      'Dimming button',
      'Blind button',
      'Read-only output',
    ],
  );
  assert.deepEqual(gladys.fake.states, []);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.equal(feature('Read-only output', 'binary').read_only, true);
  await createAll();
  const last = (name, suffix) =>
    gladys.fake.states
      .filter((s) => s.device_feature_external_id === feature(name, suffix).external_id)
      .at(-1)?.state;
  assert.equal(last('Dimmable light', 'brightness'), 37.25);
  assert.equal(last('Blind with slats', 'position'), 73);
  assert.equal(last('Blind with slats', 'tilt'), 32);
  assert.equal(last('Blind with slats', 'movement'), -1);
  const count = gladys.fake.states.length;
  send({
    'SYNTHETIC/ch0001/odp0004': '37.25',
    'SYNTHETIC/ch0002/odp0010': '81',
    'SYNTHETIC/ch0002/odp0012': '14',
  });
  await until(() => last('Blind with slats', 'position') === 19);
  assert.equal(last('Blind with slats', 'tilt'), 86);
  assert.equal(gladys.fake.states.length, count + 2);
  send({ 'SYNTHETIC/ch0002/odp0010': '', 'SYNTHETIC/ch0001/odp0004': '101' });
  await delay(30);
  assert.equal(gladys.fake.states.length, count + 2);
  assert.deepEqual(state.writes, []);
});

test('commands resolve actual pairing IDs, enforce ownership, invert positions, and stop only moving covers', async (t) => {
  const { state, command, gladys, device, feature, createAll } = await setup(t);
  assert.equal((await command('Switched consumer', 'binary', 1)).success, false);
  await createAll();
  const count = gladys.fake.states.length;
  for (const [name, suffix, value] of [
    ['Switched consumer', 'binary', 0],
    ['Dimmable light', 'binary', 1],
    ['Dimmable light', 'brightness', 63],
    ['Dimmable light', 'brightness', 0],
    ['Blind with slats', 'movement', 1],
    ['Blind with slats', 'movement', -1],
    ['Blind with slats', 'position', 23],
    ['Blind with slats', 'tilt', 84],
    ['Blind with slats', 'movement', 0],
  ])
    assert.equal((await command(name, suffix, value)).success, true);
  assert.deepEqual(
    state.writes.map((w) => [w.path.split('/').at(-1), w.body]),
    [
      ['SYNTHETIC.ch0000.idp0009', '0'],
      ['SYNTHETIC.ch0001.idp0002', '1'],
      ['SYNTHETIC.ch0001.idp0003', '63'],
      ['SYNTHETIC.ch0001.idp0002', '0'],
      ['SYNTHETIC.ch0002.idp0011', '0'],
      ['SYNTHETIC.ch0002.idp0011', '1'],
      ['SYNTHETIC.ch0002.idp0017', '77'],
      ['SYNTHETIC.ch0002.idp0018', '16'],
      ['SYNTHETIC.ch0002.idp0014', '0'],
    ],
  );
  assert.equal(gladys.fake.states.length, count, 'command ACK must not invent feedback');
  for (const idle of ['0', '1']) {
    state.movement = idle;
    assert.equal((await command('Blind with slats', 'movement', 0)).success, true);
    assert.equal(state.writes.length, 9);
  }
  state.movement = 'unknown';
  assert.equal((await command('Blind with slats', 'movement', 0)).success, false);
  for (const [name, suffix, value] of [
    ['Switched consumer', 'binary', 0.5],
    ['Switched consumer', 'binary', '1'],
    ['Dimmable light', 'brightness', 101],
    ['Blind with slats', 'movement', 0.5],
    ['Blind with slats', 'position', -1],
    ['Read-only output', 'binary', 1],
    ['Dimming button', 'action', 1],
  ])
    assert.equal((await command(name, suffix, value)).success, false);
  assert.equal(
    (
      await gladys.fake.setValue(
        device('Switched consumer'),
        feature('Dimmable light', 'binary'),
        1,
      )
    ).success,
    false,
  );
  state.status = 503;
  assert.equal((await command('Switched consumer', 'binary', 1)).success, false);
  assert.equal(state.writes.length, 9);
  state.status = 200;
  state.dropResponse = true;
  assert.equal((await command('Switched consumer', 'binary', 1)).success, false);
  assert.equal(state.writes.length, 10, 'lost response must not retry a possibly executed command');
});

test('identical live button telegrams trigger independently; snapshots, actuator feedback and unknown groups never trigger', async (t) => {
  const { gladys, state, send, createAll, device } = await setup(t);
  await createAll();
  assert.deepEqual(gladys.fake.sceneEvents, []);
  for (const raw of ['1', '1', '0']) send({ 'SYNTHETIC/ch0003/odp0005': raw });
  send({ 'SYNTHETIC/ch0003/odp0008': '9' });
  send({ 'SYNTHETIC/ch0003/odp0008': '1' });
  send({ 'SYNTHETIC/ch0003/odp0008': '8' });
  send({ 'SYNTHETIC/ch0004/odp0005': '0' });
  send({ 'SYNTHETIC/ch0004/odp0008': '1' });
  await until(() => gladys.fake.sceneEvents.length === 8);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.data.action),
    ['on', 'on', 'off', 'dim_up', 'dim_down', 'dim_stop', 'open', 'stop_down'],
  );
  assert.equal(gladys.fake.sceneEvents[0].data.device, device('Dimming button').external_id);
  send({
    'SYNTHETIC/ch0000/odp0011': '0',
    'SYNTHETIC/ch0006/odp0000': '1',
    'SYNTHETIC/ch0003/odp0005': '2',
  });
  await delay(30);
  assert.equal(gladys.fake.sceneEvents.length, 8);
  await gladys.fake.deviceDeleted(device('Dimming button'));
  send({ 'SYNTHETIC/ch0003/odp0005': '1' });
  await delay(30);
  assert.equal(gladys.fake.sceneEvents.length, 8);
  assert.deepEqual(state.writes, []);
});

test('reconnect resynchronizes changed capabilities without generating presses or replaying writes', async (t) => {
  const { state, gladys, createAll, send } = await setup(t);
  await createAll();
  state.initialFrame = true;
  const channel = state.configuration['synthetic-system'].devices.SYNTHETIC.channels.ch0002;
  delete channel.inputs.idp0018;
  delete channel.outputs.odp0012;
  state.sockets.at(-1).terminate();
  await until(() => state.sockets.length >= 2 && gladys.fake.connectionStatus.connected);
  assert.equal(
    gladys.fake.discoveredDevices.find((d) => d.name === 'Blind with slats').features.length,
    2,
  );
  assert.deepEqual(gladys.fake.sceneEvents, []);
  // A configuration telegram can contain cached sensor data. It is not a press.
  send({ 'SYNTHETIC/ch0003/odp0005': '1' }, { configDirty: true });
  await delay(50);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.deepEqual(state.writes, []);
});

test('startup failure retries, config replacement stops old subscriptions, and invalid config blocks commands', async (t) => {
  const { state, gladys, createAll, command, send } = await setup(t, { configurationFailures: 1 });
  assert.ok(state.sockets.length >= 2);
  await createAll();
  const config = { ...gladys.config };
  await gladys.fake.configUpdated({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal((await command('Switched consumer', 'binary', 1)).success, false);
  await gladys.fake.configUpdated(config);
  await until(() => gladys.fake.connectionStatus.connected);
  send({ 'SYNTHETIC/ch0003/odp0005': '1' });
  await until(() => gladys.fake.sceneEvents.length === 1);
  assert.deepEqual(state.writes, []);
});

test('incomplete config never reaches a controller and errors do not reveal secrets', async (t) => {
  const gladys = createFakeGladys({ config: {} });
  t.after(() => gladys.disconnect());
  let requests = 0;
  registerHandlers(gladys, {
    fetch: async () => {
      requests += 1;
      throw new Error('private-secret');
    },
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal((await gladys.fake.action('test_connection', {})).success, false);
  assert.equal(requests, 0);
});
