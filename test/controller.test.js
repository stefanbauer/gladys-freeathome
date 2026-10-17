import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { FreeAtHomeController } from '../src/controller.js';

const credentials = { api_username: 'synthetic-user', api_password: 'synthetic:p@ss' };
// Synthetic ABB-shaped data, not a dump from an installation.
const configuration = {
  'synthetic-system': {
    devices: {
      'synthetic-device': {
        channels: {
          ch0002: {
            functionID: '0012',
            inputs: { idp0003: { pairingID: 17, value: '37' } },
            outputs: { odp0004: { pairingID: 272, value: '37.25' } },
          },
        },
      },
    },
  },
};

test('reads the official configuration endpoint with Basic auth, without writing', async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      auth: request.headers.authorization,
    });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(configuration));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const controller = new FreeAtHomeController({
    ...credentials,
    controller_url: `http://127.0.0.1:${server.address().port}`,
  });
  assert.deepEqual(await controller.getConfiguration(), configuration);
  assert.deepEqual(requests, [
    {
      method: 'GET',
      url: '/fhapi/v1/api/rest/configuration',
      auth: `Basic ${Buffer.from('synthetic-user:synthetic:p@ss').toString('base64')}`,
    },
  ]);
});

test('does not forward credentials to a redirect destination', async (t) => {
  let redirectedRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/redirect-target') redirectedRequests += 1;
    response.writeHead(302, { Location: '/redirect-target' });
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const controller = new FreeAtHomeController({
    ...credentials,
    controller_url: `http://127.0.0.1:${server.address().port}`,
  });
  await assert.rejects(controller.getConfiguration(), /Controller request failed/);
  assert.equal(redirectedRequests, 0);
});

test('rejects authentication errors, HTML and invalid API models without exposing response data', async () => {
  for (const [body, status, expected] of [
    ['private-response', 401, /HTTP 401/],
    ['private-response', 403, /HTTP 403/],
    ['<html>private-response</html>', 200, /did not return JSON/],
    ['{}', 200, /unexpected configuration/],
    ['[]', 200, /unexpected configuration/],
    ['{"system":{"devices":[]}}', 200, /unexpected configuration/],
  ]) {
    const controller = new FreeAtHomeController(
      { ...credentials, controller_url: 'https://controller.invalid' },
      { fetch: async () => new Response(body, { status }) },
    );
    await assert.rejects(controller.getConfiguration(), (error) => {
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, /private-response|synthetic:p@ss/);
      return true;
    });
  }
});

test('refuses embedded URL credentials and non-origin controller addresses', () => {
  for (const controller_url of [
    'ftp://controller.invalid',
    'https://name:password@controller.invalid',
    'https://controller.invalid/swagger',
    'https://controller.invalid?token=secret',
    'https://controller.invalid#secret',
  ]) {
    assert.throws(() => new FreeAtHomeController({ ...credentials, controller_url }));
  }
  assert.throws(
    () =>
      new FreeAtHomeController({
        ...credentials,
        controller_url: 'http://controller.invalid',
        api_username: 'bad:user',
      }),
    /API username/,
  );
});
