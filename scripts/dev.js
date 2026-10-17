import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { FreeAtHomeController } from '../src/controller.js';
import { prompt } from './prompt.js';

const SESSION = 'data/dev-session.json';
const REGISTRATION = 'data/dev-registration.json';
const command = process.argv[2];

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
async function privateFile(path, value) {
  await mkdir('data', { recursive: true, mode: 0o700 });
  await chmod('data', 0o700);
  await writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

try {
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
  const manifest = await json('gladys-assistant-integration.json');
  let saved;
  try {
    saved = await json(REGISTRATION);
    if (
      saved.origin !== host.origin ||
      !/^ext-dev-freehome(?:-\d+)?$/.test(saved.selector) ||
      typeof saved.docker_image !== 'string' ||
      !saved.docker_image
    )
      throw new Error('Unexpected development registration.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Gladys updates the installed image reference. Keep that reference in the
  // private receipt so rebuilding never requires deleting devices or config.
  const image = saved?.docker_image || manifest.docker_image;

  function prepare() {
    const result = spawnSync(
      'docker',
      [
        'build',
        '--label',
        `io.gladysassistant.manifest=${JSON.stringify(manifest)}`,
        '-t',
        image,
        '.',
      ],
      { stdio: 'inherit' },
    );
    if (result.error || result.status !== 0) throw new Error('Docker build failed.');
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
  async function authenticate() {
    const session = await json(SESSION);
    if (session.origin !== host.origin) throw new Error('Session belongs to another instance.');
    const { access_token } = await request('/api/v1/access_token', {
      refresh_token: session.refresh_token,
    });
    return access_token;
  }
  function verify(installed) {
    if (
      !installed ||
      installed.selector !== saved.selector ||
      installed.docker_image !== image ||
      installed.store_slug ||
      installed.manifest.name !== manifest.name
    )
      throw new Error('Refusing to alter an unexpected integration.');
  }

  if (command === 'login') {
    console.log('Login to local Gladys. Email/password hidden; password never stored.');
    const session = await request('/api/v1/login', {
      email: await prompt('Gladys admin email:', true),
      password: await prompt('Gladys admin password:', true),
    });
    if (session.role !== 'admin') throw new Error('An admin is required.');
    await privateFile(SESSION, { origin: host.origin, refresh_token: session.refresh_token });
    console.log('Private development session saved. Run npm run dev:sync to build and install.');
  } else if (command === 'prepare') prepare();
  else if (command === 'sync') {
    const token = await authenticate();
    const integrations = await request('/api/v1/external_integration', undefined, token);
    if (saved) verify(integrations.find((i) => i.selector === saved.selector));
    else if (integrations.some((i) => i.docker_image === image))
      throw new Error('An unrecorded development registration exists. Inspect before retrying.');
    // Rebuild even when the manifest is unchanged: source changes matter too.
    prepare();
    const updated = saved
      ? await request(`/api/v1/external_integration/${saved.selector}/update`, {}, token)
      : await request('/api/v1/external_integration', { docker_image: image, manifest }, token);
    if (
      !/^ext-dev-freehome(?:-\d+)?$/.test(updated.selector) ||
      (saved && updated.selector !== saved.selector) ||
      updated.docker_image !== image ||
      updated.store_slug ||
      JSON.stringify(updated.manifest) !== JSON.stringify(manifest)
    )
      throw new Error('Unexpected install result. Inspect Gladys before retrying.');
    await privateFile(REGISTRATION, {
      origin: host.origin,
      selector: updated.selector,
      docker_image: image,
    });
    console.log('Runtime container installed/updated. Gladys manages its process and credentials.');
  } else if (command === 'configure') {
    if (!saved) throw new Error('Install this development integration first.');
    const token = await authenticate();
    verify(await request(`/api/v1/external_integration/${saved.selector}`, undefined, token));
    const config = await json('data/controller.json');
    await new FreeAtHomeController(config).getConfiguration(); // Read-only validation first.
    await request(`/api/v1/external_integration/${saved.selector}/config`, { config }, token);
    console.log('Own controller settings saved in Gladys. No device command sent.');
  } else throw new Error('Unknown development command.');
} catch (error) {
  console.error(
    `Local development setup failed${Number.isInteger(error.status) ? ` (Gladys HTTP ${error.status})` : ''}. Check Gladys/Docker and the private registration receipt; run npm run dev:login in an interactive terminal if needed. No secrets printed.`,
  );
  process.exitCode = 1;
}
