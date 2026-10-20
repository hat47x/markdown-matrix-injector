import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';

import {
  auditVsixEntries,
  changelogSection,
  checkVersionConsistency,
  contributedEntries,
  extractZip,
  readZipFiles,
  isReleasable,
  listZipEntries,
  renderReleaseNotes,
  REQUIRED_VSIX_ENTRIES,
  sumTestSummary,
} from '../scripts/release-candidate.mjs';

/** A minimal ZIP with the given entry names (stored bytes are irrelevant here). */
function zipOf(names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = deflateRawSync(Buffer.from('x'));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

test('lists the entry names of a ZIP central directory', () => {
  assert.deepEqual(listZipEntries(zipOf(['extension/package.json', 'extension/dist/src/extension.js'])), [
    'extension/package.json',
    'extension/dist/src/extension.js',
  ]);
  assert.throws(() => listZipEntries(Buffer.from('not a zip at all, not even close')), /Not a ZIP/u);
});

test('a VSIX passes the audit only with every required and runtime file and nothing forbidden', () => {
  const runtime = ['dist/src/extension.js', 'dist/src/core/pathResolver.js'];
  const good = [...REQUIRED_VSIX_ENTRIES, 'extension/dist/src/core/pathResolver.js'];
  assert.deepEqual(auditVsixEntries(good, runtime), []);

  const problems = auditVsixEntries(
    [...REQUIRED_VSIX_ENTRIES.filter((entry) => !entry.endsWith('LICENSE.txt')), 'extension/dist/src/experimental/x.js', 'extension/test/fixtures/a.xlsx'],
    runtime,
  );
  assert.ok(problems.includes('missing required entry extension/LICENSE.txt'));
  assert.ok(problems.some((problem) => problem.includes('research layer')));
  assert.ok(problems.some((problem) => problem.includes('test sources')));
  assert.ok(problems.includes('runtime module not shipped: extension/dist/src/core/pathResolver.js'));
});

test('reads one version section of a Keep a Changelog file', () => {
  const changelog = '# Changelog\r\n\r\n## [Unreleased]\r\n\r\n## [0.2.0] - 2026-10-20\r\n\r\n### Fixed\r\n- a\r\n\r\n## [0.1.0] - 2026-07-15\r\n- old\r\n';
  assert.deepEqual(changelogSection(changelog, '0.2.0'), { heading: '## [0.2.0] - 2026-10-20', body: '### Fixed\n- a' });
  assert.equal(changelogSection(changelog, '0.3.0'), undefined);
  assert.equal(changelogSection(changelog, '0.1.0')?.body, '- old');
});

test('version facts must agree before anything is built', () => {
  const facts = {
    packageJson: { version: '0.2.0', engines: { vscode: '^1.100.0' }, dependencies: { yaml: '2.9.1' }, devDependencies: { '@types/vscode': '^1.96.0' } },
    packageLock: { version: '0.2.0', packages: { '': { version: '0.2.0' }, 'node_modules/yaml': { version: '2.9.1' } } },
    changelog: '## [0.2.0] - 2026-10-20\n- change\n',
    readme: '最低対応バージョンはVS Code 1.100.0です。',
  };
  assert.deepEqual(checkVersionConsistency(facts), []);

  const problems = checkVersionConsistency({
    ...facts,
    packageJson: { ...facts.packageJson, devDependencies: { '@types/vscode': '^1.101.0' } },
    packageLock: { version: '0.1.0', packages: { '': { version: '0.1.0' } } },
    changelog: '## [Unreleased]\n',
    readme: '最低対応バージョンはVS Code 1.96.0です。',
  });
  assert.equal(problems.length, 6, problems.join('\n'));
  assert.ok(problems.some((problem) => problem.includes('README.md minimum VS Code 1.96.0')));
  assert.ok(problems.some((problem) => problem.includes('newer than engines.vscode')));

  assert.ok(checkVersionConsistency({ ...facts, changelog: '## [0.2.0]\n- undated\n' }).some((problem) => problem.includes('no release date')));
  assert.ok(
    checkVersionConsistency({ ...facts, packageLock: { version: '0.2.0', packages: { '': { version: '0.2.0' } } } })
      .some((problem) => problem.includes('runtime dependency yaml')),
    'a runtime dependency dropped from the lockfile must stop the candidate',
  );
});

test('test summaries of all lanes are added up', () => {
  const output = 'ℹ tests 10\nℹ pass 9\nℹ fail 0\nℹ skipped 1\n...\nℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\n';
  assert.deepEqual(sumTestSummary(output), { tests: 13, pass: 12, fail: 0, skipped: 1 });
});

test('only a clean tree with every automated step passed is releasable; optional steps may be not-run', () => {
  const evidence = (dirty, steps) => ({ source: { dirty }, steps });
  assert.equal(isReleasable(evidence(false, [{ status: 'passed' }, { status: 'not-run', optional: true }])), true);
  assert.equal(isReleasable(evidence(true, [{ status: 'passed' }])), false, 'dirty tree');
  assert.equal(isReleasable(evidence(false, [{ status: 'passed' }, { status: 'not-run' }])), false, 'a required step that did not run');
  assert.equal(isReleasable(evidence(false, [{ status: 'failed', optional: true }])), false, 'an optional step that failed');
  assert.equal(isReleasable(evidence(false, [])), false, 'nothing ran');
});

test('release notes list manual checks as unchecked, never as done', () => {
  const notes = renderReleaseNotes({
    version: '0.2.0',
    source: { commit: 'abc', dirty: false },
    environment: { os: 'linux', arch: 'x64', node: 'v22' },
    steps: [{ id: 'build', status: 'passed' }],
    artifacts: [{ path: 'x.vsix', sha256: 'f00' }],
    manualChecks: [{ gate: 'ADR-0010 G1', check: 'preview' }],
  }, '- change');
  assert.match(notes, /- \[ \] ADR-0010 G1: preview/u);
  assert.match(notes, /\| build \| passed \|/u);
  assert.doesNotMatch(notes, /- \[x\]/u);
});

test('npm and npx go through cmd.exe on Windows, with arguments that need it quoted', async () => {
  const { spawnPlan } = await import('../scripts/npm-spawn.mjs');
  assert.deepEqual(spawnPlan('npm', ['pack', 'C:/My Dir/x.tgz'], 'win32'), { file: 'npm.cmd', args: ['pack', '"C:/My Dir/x.tgz"'], shell: true });
  assert.deepEqual(spawnPlan('npm', ['ci', '--omit=dev'], 'linux'), { file: 'npm', args: ['ci', '--omit=dev'], shell: false });
  assert.deepEqual(spawnPlan('git', ['status'], 'win32'), { file: 'git', args: ['status'], shell: false });
});

test('compiled dev scripts, portable experiments and type declarations do not ship', () => {
  const problems = auditVsixEntries([
    ...REQUIRED_VSIX_ENTRIES,
    'extension/dist/scripts/sai2b-retry-frozen-materialization.js',
    'extension/portable/go-minimum/main.go',
    'extension/dist/src/extension.d.ts',
  ]);
  assert.equal(problems.length, 3, problems.join('\n'));
});

/** A ZIP whose entries really hold `content`, deflated or stored. */
function zipWith(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, content, stored = false } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const plain = Buffer.from(content, 'utf8');
    const data = stored ? plain : deflateRawSync(plain);
    const method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

test('a VSIX is unpacked with deflated and stored entries, and nothing may escape the folder (#598)', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const zip = zipWith([
    { name: 'extension/package.json', content: '{"name":"x"}' },
    { name: 'extension/media/a.css', content: 'body{}', stored: true },
  ]);
  assert.deepEqual(readZipFiles(zip).map(({ name, data }) => [name, data.toString('utf8')]), [
    ['extension/package.json', '{"name":"x"}'],
    ['extension/media/a.css', 'body{}'],
  ]);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-unzip-test-'));
  extractZip(zip, target);
  assert.equal(fs.readFileSync(path.join(target, 'extension', 'media', 'a.css'), 'utf8'), 'body{}');
  assert.throws(() => extractZip(zipWith([{ name: '../escape.txt', content: 'no' }]), target), /escapes destination/u);
  assert.equal(fs.existsSync(path.join(target, '..', 'escape.txt')), false);
});

test('files that package.json contributes must be listed for the VSIX audit (#598)', () => {
  assert.deepEqual(contributedEntries({
    main: './dist/src/extension.js',
    icon: 'media/icon.png',
    l10n: './l10n',
    contributes: {
      'markdown.previewStyles': ['./media/preview.css'],
      walkthroughs: [{ steps: [{ media: { markdown: 'media/walkthrough/write.md' } }, { media: { image: 'media/a.png', altText: 'a' } }] }],
    },
  }), [
    'extension/dist/src/extension.js',
    'extension/l10n/bundle.l10n.ja.json',
    'extension/media/a.png',
    'extension/media/icon.png',
    'extension/media/preview.css',
    'extension/media/walkthrough/write.md',
  ]);
});
