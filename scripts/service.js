import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const label = 'com.gladysassistant.freeathome';
const plist = join(homedir(), 'Library/LaunchAgents', `${label}.plist`);
const log = join(root, 'data/runtime.log');
const entry = join(root, 'index.js');
const domain = `gui/${process.getuid?.()}`;
const target = `${domain}/${label}`;
const command = process.argv[2];

function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${program} command failed.`);
  return result.stdout;
}

async function installed() {
  let info;
  try {
    info = await lstat(plist);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('Cannot inspect the LaunchAgent file.', { cause: error });
  }
  if (!info.isFile() || info.uid !== process.getuid())
    throw new Error('Refusing a symlink or foreign LaunchAgent file.');
  const saved = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]));
  if (
    saved.Label !== label ||
    saved.WorkingDirectory !== root ||
    saved.ProgramArguments?.length !== 3 ||
    saved.ProgramArguments[1] !== '--env-file-if-exists=.env' ||
    saved.ProgramArguments[2] !== entry ||
    saved.StandardOutPath !== log ||
    saved.StandardErrorPath !== log
  )
    throw new Error('Refusing a LaunchAgent belonging to another checkout.');
  return saved;
}

function status() {
  const result = spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' });
  if (result.error) throw new Error('Cannot query launchd.');
  return {
    loaded: result.status === 0,
    pid: Number(result.stdout?.match(/\bpid = (\d+)/)?.[1]) || null,
  };
}

function refuseManualRuntime() {
  const processes = run('/bin/ps', ['-axo', 'pid=,args=']);
  for (const line of processes.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match || !/(?:^|\/)node\s/.test(match[2])) continue;
    if (!match[2].includes(' index.js') && !match[2].includes(entry)) continue;
    const cwd = run('/usr/sbin/lsof', ['-a', '-p', match[1], '-d', 'cwd', '-Fn']);
    if (cwd.split('\n').includes(`n${root}`))
      throw new Error(
        'A native runtime is already running here. Stop it before installing autostart.',
      );
  }
}

try {
  if (process.platform !== 'darwin' || process.versions.node.split('.')[0] !== '24')
    throw new Error('This helper requires macOS and Node.js 24.');
  if (!['install', 'status', 'uninstall', 'restart'].includes(command))
    throw new Error('Use service:install, service:status, service:restart or service:uninstall.');
  const saved = await installed();
  const running = status();
  if (!saved && running.loaded) throw new Error('An unrecognized job already uses this label.');

  if (command === 'status') {
    console.log(JSON.stringify({ installed: !!saved, ...running }));
  } else if (command === 'uninstall') {
    if (running.loaded) run('/bin/launchctl', ['bootout', target]);
    if (saved) await unlink(plist);
    console.log('Own LaunchAgent removed. Registration, credentials and devices are unchanged.');
  } else if (command === 'restart') {
    if (!saved || !running.loaded) throw new Error('Install this LaunchAgent first.');
    run('/bin/launchctl', ['kickstart', '-k', target]);
    console.log('Own LaunchAgent restarted. No device command sent.');
  } else {
    const env = join(root, '.env');
    if ((await lstat(env)).mode & 0o077) throw new Error('Protect .env with chmod 600 first.');
    process.loadEnvFile(env);
    const registration = JSON.parse(
      await readFile(join(root, 'data/dev-registration.json'), 'utf8'),
    );
    const host = new URL(process.env.GLADYS_HOST_API_URL);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) ||
      registration.origin !== host.origin ||
      !/^ext-dev-freehome(?:-\d+)?$/.test(registration.selector) ||
      process.env.GLADYS_INTEGRATION_SELECTOR !== registration.selector ||
      !process.env.GLADYS_INTEGRATION_TOKEN
    )
      throw new Error('Configure this checkout’s own local development registration first.');
    if (saved && saved.ProgramArguments[0] !== process.execPath)
      throw new Error('Node path changed. Uninstall and reinstall this LaunchAgent.');
    if (!running.loaded) refuseManualRuntime();
    if (!saved) {
      const xml = (value) =>
        value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&apos;');
      const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>--env-file-if-exists=.env</string><string>${xml(entry)}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
<key>Umask</key><integer>63</integer>
</dict></plist>
`;
      await mkdir(join(root, 'data'), { recursive: true, mode: 0o700 });
      await chmod(join(root, 'data'), 0o700);
      await writeFile(log, '', { flag: 'a', mode: 0o600 });
      await chmod(log, 0o600);
      await mkdir(dirname(plist), { recursive: true });
      await writeFile(plist, contents, { flag: 'wx', mode: 0o600 });
    }
    if (!running.loaded) run('/bin/launchctl', ['bootstrap', domain, plist]);
    console.log(
      'Own LaunchAgent installed: start at login, restart after exit; 15s restart throttle.',
    );
  }
} catch (error) {
  // Never print launchctl output, environment data or JSON parse errors.
  const safe =
    error.message &&
    /^(This helper|Use service:|Cannot |Refusing |An unrecognized|A native|Install this|Protect |Configure this|Node path|\/bin\/|\/usr\/)/.test(
      error.message,
    );
  console.error(
    safe ? error.message : 'Service operation failed. Check service:status; no secrets printed.',
  );
  process.exitCode = 1;
}
