import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as prettier from 'prettier';

const script = fileURLToPath(new URL('../.github/scripts/release.mjs', import.meta.url));
const repo = 'https://github.com/example/integration';
const image = 'ghcr.io/example/integration:0.1.0';

test('release CLI rolls notes, preserves manifest metadata and refuses inconsistent release candidates', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'freeathome-release-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const manifestText = await readFile(
    new URL('../gladys-assistant-integration.json', import.meta.url),
    'utf8',
  );
  const manifest = JSON.parse(manifestText);
  const notes = '### Added\n\n- Initial integration functionality.';
  const files = {
    'package.json': JSON.stringify({ version: '0.1.0' }),
    'package-lock.json': JSON.stringify({
      version: '0.1.0',
      packages: { '': { version: '0.1.0' } },
    }),
    'gladys-assistant-integration.json': manifestText,
    'CHANGELOG.md': `# Changelog\n\n## [Unreleased]\n\n${notes}\n\n[Unreleased]: ${repo}/commits/main\n`,
  };
  for (const [file, text] of Object.entries(files)) await writeFile(join(cwd, file), text);
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  assert.notEqual(
    run('check', '0.1.0', image).status,
    0,
    'Unreleased source is not a release candidate',
  );
  const prepared = run('prepare', '0.1.0', image, repo);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(run('check', '0.1.0', image).status, 0);
  const updated = await readFile(join(cwd, 'gladys-assistant-integration.json'), 'utf8');
  assert.deepEqual(JSON.parse(updated), { ...manifest, version: '0.1.0', docker_image: image });
  const changelog = await readFile(join(cwd, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## \[Unreleased\]\n\n## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}/);
  assert.match(changelog, /releases\/tag\/0\.1\.0/);
  const extracted = spawnSync(process.execPath, [script, 'notes', '0.1.0'], {
    cwd,
    input: changelog,
    encoding: 'utf8',
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.equal(extracted.stdout.trim(), notes);
  for (const [text, parser] of [
    [updated, 'json'],
    [changelog, 'markdown'],
  ]) {
    const options = await prettier.resolveConfig(script);
    assert.equal(await prettier.format(text, { ...options, parser }), text);
  }
  for (const [file, invalid] of [
    ['package.json', { version: '0.1.1' }],
    ['package-lock.json', { version: '0.1.1', packages: { '': { version: '0.1.0' } } }],
    ['package-lock.json', { version: '0.1.0', packages: { '': { version: '0.1.1' } } }],
    ['gladys-assistant-integration.json', { ...manifest, version: '0.1.1', docker_image: image }],
    [
      'gladys-assistant-integration.json',
      { ...manifest, version: '0.1.0', docker_image: `${image}-wrong` },
    ],
  ]) {
    const original = await readFile(join(cwd, file), 'utf8');
    await writeFile(join(cwd, file), JSON.stringify(invalid));
    assert.notEqual(run('check', '0.1.0', image).status, 0, `Reject inconsistent ${file}`);
    await writeFile(join(cwd, file), original);
  }
  for (const invalid of [
    files['CHANGELOG.md'],
    changelog.replace('## [Unreleased]', '## [Unreleased]\n\n- Pending.'),
  ]) {
    await writeFile(join(cwd, 'CHANGELOG.md'), invalid);
    assert.notEqual(run('check', '0.1.0', image).status, 0);
  }
  await writeFile(join(cwd, 'CHANGELOG.md'), changelog);
  for (const version of ['v0.1.0', '00.1.0', '0.1.0-beta.1', '0.1.1'])
    assert.notEqual(run('check', version, image).status, 0);
  assert.notEqual(
    run('prepare', '0.1.0', image, repo).status,
    0,
    'Never roll the same version twice',
  );
  await writeFile(
    join(cwd, 'CHANGELOG.md'),
    changelog.replace('## [Unreleased]', '## [Unreleased]\n\n- Fix.'),
  );
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ version: '0.1.1' }));
  await writeFile(
    join(cwd, 'package-lock.json'),
    JSON.stringify({ version: '0.1.1', packages: { '': { version: '0.1.1' } } }),
  );
  assert.equal(run('prepare', '0.1.1', 'ghcr.io/example/integration:0.1.1', repo).status, 0);
  assert.equal(run('check', '0.1.1', 'ghcr.io/example/integration:0.1.1').status, 0);
  assert.match(await readFile(join(cwd, 'CHANGELOG.md'), 'utf8'), /compare\/0\.1\.0\.\.\.0\.1\.1/);
});
