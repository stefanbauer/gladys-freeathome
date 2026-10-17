import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { GladysIntegration } from '@gladysassistant/integration-sdk';
import { FreeAtHomeController } from '../src/controller.js';
import { prompt } from './prompt.js';

const IMAGE = 'gladys-freeathome-host-dev:0.1.0';
const SESSION = 'data/dev-session.json';
const REGISTRATION = 'data/dev-registration.json';
const command = process.argv[2];

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
async function privateFile(path, value) {
  await mkdir('data', { recursive: true, mode: 0o700 });
  await chmod('data', 0o700);
  await writeFile(path, value, { mode: 0o600 });
  await chmod(path, 0o600);
}
function docker(args, visible = false) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: visible ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error('Docker failed.');
  return result.stdout;
}

try {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const host = new URL(process.env.GLADYS_HOST_API_URL || 'http://localhost:1443');
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) ||
    !['http:', 'https:'].includes(host.protocol) ||
    host.username ||
    host.password ||
    host.pathname !== '/' ||
    host.search ||
    host.hash
  )
    throw new Error('Development requires a loopback Gladys origin.');
  const manifest = { ...(await json('gladys-assistant-integration.json')), docker_image: IMAGE };
  async function prepare() {
    docker(
      [
        'build',
        '-f',
        'Dockerfile.dev',
        '--label',
        `io.gladysassistant.manifest=${JSON.stringify(manifest)}`,
        '-t',
        IMAGE,
        '.',
      ],
      true,
    );
  }
  async function request(route, body, token) {
    const response = await fetch(new URL(route, host), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const error = new Error('Local Gladys request failed.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function registration() {
    const saved = await json(REGISTRATION);
    if (saved.origin !== host.origin || !/^ext-dev-freehome(?:-\d+)?$/.test(saved.selector))
      throw new Error('Unexpected development registration.');
    return saved;
  }
  async function connect() {
    const { selector } = await registration();
    const [container] = JSON.parse(docker(['inspect', `gladys-${selector}`]));
    if (
      container.Config.Image !== IMAGE ||
      container.Config.Labels?.['io.gladysassistant.manifest'] !== JSON.stringify(manifest)
    )
      throw new Error('Unexpected development container.');
    const env = Object.fromEntries(
      container.Config.Env.map((v) => {
        const i = v.indexOf('=');
        return [v.slice(0, i), v.slice(i + 1)];
      }),
    );
    if (
      env.GLADYS_INTEGRATION_SELECTOR !== selector ||
      !env.GLADYS_INTEGRATION_TOKEN ||
      /[\r\n]/.test(env.GLADYS_INTEGRATION_TOKEN)
    )
      throw new Error('Unexpected credentials.');
    // Never overwrite another integration's environment file.
    if (
      process.env.GLADYS_INTEGRATION_SELECTOR &&
      process.env.GLADYS_INTEGRATION_SELECTOR !== selector
    )
      throw new Error('Another selector is configured.');
    const settings = {
      GLADYS_HOST_API_URL: host.origin,
      GLADYS_INTEGRATION_SELECTOR: selector,
      GLADYS_INTEGRATION_TOKEN: env.GLADYS_INTEGRATION_TOKEN,
      LOG_LEVEL: 'info',
    };
    await privateFile(
      '.env',
      `${Object.entries(settings)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')}\n`,
    );
    Object.assign(process.env, settings);
    console.log('Own development SDK credentials saved with mode 600; token not printed.');
  }
  async function sync() {
    const session = await json(SESSION);
    if (session.origin !== host.origin) throw new Error('Session belongs to another instance.');
    const { access_token } = await request('/api/v1/access_token', {
      refresh_token: session.refresh_token,
    });
    const integrations = await request('/api/v1/external_integration', undefined, access_token);
    let saved;
    try {
      saved = await registration();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const installed = saved && integrations.find((i) => i.selector === saved.selector);
    if (
      saved &&
      (!installed ||
        installed.docker_image !== IMAGE ||
        installed.store_slug ||
        installed.manifest.name !== manifest.name)
    )
      throw new Error('Refusing to alter an unexpected integration.');
    if (!saved && integrations.some((i) => i.docker_image === IMAGE))
      throw new Error(
        'An unrecorded development registration already exists. Inspect it before retrying.',
      );
    if (!installed || JSON.stringify(installed.manifest) !== JSON.stringify(manifest)) {
      await prepare();
      const updated = installed
        ? await request(`/api/v1/external_integration/${saved.selector}/update`, {}, access_token)
        : await request(
            '/api/v1/external_integration',
            { docker_image: IMAGE, manifest },
            access_token,
          );
      if (
        !/^ext-dev-freehome(?:-\d+)?$/.test(updated.selector) ||
        (saved && updated.selector !== saved.selector) ||
        updated.docker_image !== IMAGE ||
        updated.store_slug ||
        JSON.stringify(updated.manifest) !== JSON.stringify(manifest)
      )
        throw new Error('Unexpected install result. Inspect Gladys before retrying.');
      await privateFile(
        REGISTRATION,
        `${JSON.stringify({ origin: host.origin, selector: updated.selector })}\n`,
      );
    }
    await connect();
  }

  if (command === 'login') {
    console.log('One-time login to local Gladys. Email/password hidden; password never stored.');
    const session = await request('/api/v1/login', {
      email: await prompt('Gladys admin email:', true),
      password: await prompt('Gladys admin password:', true),
    });
    if (session.role !== 'admin') throw new Error('An admin is required.');
    await privateFile(
      SESSION,
      `${JSON.stringify({ origin: host.origin, refresh_token: session.refresh_token })}\n`,
    );
    await sync();
  } else if (command === 'prepare') await prepare();
  else if (command === 'sync') await sync();
  else if (command === 'connect') await connect();
  else if (command === 'configure') {
    await connect();
    const config = await json('data/controller.json');
    await new FreeAtHomeController(config).getConfiguration(); // Read-only validation first.
    const sdk = new GladysIntegration();
    await sdk.setConfig(config);
    console.log(
      'Existing private controller settings copied only to this integration. No device command sent.',
    );
  } else throw new Error('Unknown development command.');
} catch (error) {
  console.error(
    `Local development setup failed${Number.isInteger(error.status) ? ` (Gladys HTTP ${error.status})` : ''}. Check Gladys/Docker and run npm run dev:login in an interactive Mac terminal if needed. No secrets printed.`,
  );
  process.exitCode = 1;
}
