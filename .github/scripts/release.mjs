// Local-only metadata operations. Git pushes, image publication and GitHub
// releases belong to the workflow, never this CLI.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const [command, version, image, repo] = process.argv.slice(2);
assert.match(
  version ?? '',
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  'Use stable X.Y.Z without v',
);
const manifestPath = 'gladys-assistant-integration.json';
const changelogPath = 'CHANGELOG.md';

function section(text, label) {
  const heading = new RegExp(`^## \\[${label.replaceAll('.', '\\.')}\\](?: |$).*$`, 'm').exec(text);
  if (!heading) return null;
  const start = heading.index + heading[0].length;
  const next = text.slice(start).search(/^(?:## |\[[^\]]+\]: )/m);
  const end = next === -1 ? text.length : start + next;
  return { heading: heading.index, end, body: text.slice(start, end).trim() };
}

if (command === 'prepare') {
  assert.ok(image && repo, 'prepare requires an image and repository URL');
  const text = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(text);
  const values = { version, docker_image: image };
  // Preserve the existing Prettier layout, including compact translated labels.
  const updated = text.replace(
    /^ {2}"(version|docker_image)": "[^"]*"/gm,
    (_match, key) => `  "${key}": ${JSON.stringify(values[key])}`,
  );
  assert.deepEqual(JSON.parse(updated), { ...manifest, ...values });
  const changelog = readFileSync(changelogPath, 'utf8');
  const unreleased = section(changelog, 'Unreleased');
  assert.ok(unreleased?.body, 'Add release notes under ## [Unreleased] first');
  assert.equal(section(changelog, version), null, 'Version is already in the changelog');
  const rest = changelog.slice(unreleased.end).trimStart();
  const previous = /^## \[(\d+\.\d+\.\d+)\]/m.exec(rest)?.[1];
  const date = new Date().toISOString().slice(0, 10);
  let rolled =
    `${changelog.slice(0, unreleased.heading)}## [Unreleased]\n\n` +
    `## [${version}] - ${date}\n\n${unreleased.body}\n\n${rest}`;
  const links =
    `[Unreleased]: ${repo}/compare/${version}...HEAD\n` +
    (previous
      ? `[${version}]: ${repo}/compare/${previous}...${version}`
      : `[${version}]: ${repo}/releases/tag/${version}`);
  rolled = /^\[Unreleased\]: .*$/m.test(rolled)
    ? rolled.replace(/^\[Unreleased\]: .*$/m, () => links)
    : `${rolled.trimEnd()}\n\n${links}`;
  writeFileSync(manifestPath, updated);
  writeFileSync(changelogPath, `${rolled.trimEnd()}\n`);
} else if (command === 'check') {
  assert.ok(image, 'Expected Docker image is required');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(pkg.version, version, 'Package version must match tag');
  assert.equal(lock.version, version, 'Lockfile version must match tag');
  assert.equal(lock.packages[''].version, version, 'Lockfile root version must match tag');
  assert.equal(manifest.version, version, 'Manifest version must match tag');
  assert.equal(manifest.docker_image, image, 'Manifest image must match release');
  const changelog = readFileSync(changelogPath, 'utf8');
  assert.ok(section(changelog, version)?.body, 'Release notes are required');
  assert.equal(section(changelog, 'Unreleased')?.body, '', 'Unreleased must be empty');
  console.log(`Release metadata matches ${version}.`);
} else if (command === 'notes') {
  const changelog = readFileSync(0, 'utf8');
  const notes = section(changelog, version)?.body;
  assert.ok(notes, 'Release notes are required');
  process.stdout.write(`${notes}\n`);
} else
  throw new Error(
    'Use prepare <version> <image> <repo>, check <version> <image>, or notes <version>.',
  );
