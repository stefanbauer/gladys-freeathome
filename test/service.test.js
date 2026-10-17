import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test(
  'service CLI refuses foreign and symlinked LaunchAgents without modifying them',
  {
    skip: process.platform !== 'darwin' && 'LaunchAgents are macOS-only',
  },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'freeathome-service-'));
    const file = join(home, 'Library/LaunchAgents/com.gladysassistant.freeathome.plist');
    const foreign = JSON.stringify({
      Label: 'another-service',
      WorkingDirectory: '/another-checkout',
    });
    const helper = fileURLToPath(new URL('../scripts/service.js', import.meta.url));
    try {
      await mkdir(join(home, 'Library/LaunchAgents'), { recursive: true });
      await writeFile(file, foreign, { mode: 0o600 });
      for (const command of ['install', 'restart', 'uninstall']) {
        const result = spawnSync(process.execPath, [helper, command], {
          env: { ...process.env, HOME: home },
          encoding: 'utf8',
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Refusing a LaunchAgent belonging to another checkout/);
        assert.equal(await readFile(file, 'utf8'), foreign);
      }
      const destination = join(home, 'foreign.plist');
      await writeFile(destination, foreign);
      await unlink(file);
      await symlink(destination, file);
      const result = spawnSync(process.execPath, [helper, 'uninstall'], {
        env: { ...process.env, HOME: home },
        encoding: 'utf8',
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Refusing a symlink or foreign LaunchAgent/);
      assert.equal(await readFile(file, 'utf8'), foreign);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);
