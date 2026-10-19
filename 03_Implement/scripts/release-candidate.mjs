#!/usr/bin/env node
// Builds a release candidate from one commit and binds every result to it
// (ADR-0025). The same command runs on a developer machine, in WSL and in CI:
//
//   npm run release:candidate                 # full candidate, fails closed
//   npm run release:candidate -- --e2e        # also run the Extension Host E2E
//   npm run release:candidate -- --allow-dirty  # rehearsal; never releasable
//
// Output: artifacts/release/<version>/ with the VSIX, the CLI tarball,
// SHA256SUMS, RELEASE_NOTES.md and release-evidence.json. A step that did not
// run is recorded as not-run, never as passed. The manual checks of ADR-0010
// (G1–G4 on a real VS Code) are listed as not-run: only a person can fill them.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCliPackage, collectRuntimeModuleGraph } from './build-cli-package.mjs';
import { spawnPlan } from './npm-spawn.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');
export const EVIDENCE_SCHEMA = 'mmi.release-evidence/v1';

/** Files the extension needs at runtime, as VSIX entry names. */
export const REQUIRED_VSIX_ENTRIES = [
  'extension/package.json',
  'extension/LICENSE.txt',
  'extension/cli-distribution/THIRD_PARTY_NOTICES.md',
  'extension/dist/src/extension.js',
  'extension/media/markdown-matrix.css',
  'extension/node_modules/markdown-it/package.json',
  'extension/node_modules/xlsx/package.json',
];

/** Entries that must never ship: sources, tests, research code, fixtures, dev tools. */
export const FORBIDDEN_VSIX_PATTERNS = [
  { pattern: /^extension\/src\//u, reason: 'TypeScript sources' },
  { pattern: /^extension\/test\//u, reason: 'test sources' },
  { pattern: /^extension\/dist\/test\//u, reason: 'compiled tests' },
  { pattern: /^extension\/dist\/src\/experimental\//u, reason: 'research layer (not adopted)' },
  { pattern: /^extension\/artifacts\//u, reason: 'build artifacts' },
  { pattern: /^extension\/scripts\//u, reason: 'dev scripts' },
  { pattern: /^extension\/dist\/scripts\//u, reason: 'compiled dev/research scripts' },
  { pattern: /^extension\/portable\//u, reason: 'portable-core experiments' },
  { pattern: /^extension\/dist\/.*\.d\.ts$/u, reason: 'type declarations' },
  { pattern: /\/fixtures\//u, reason: 'test fixtures' },
  { pattern: /\.vsix$/u, reason: 'nested VSIX' },
  { pattern: /^extension\/node_modules\/(typescript|tsx|esbuild|@vscode\/vsce|@vscode\/test-electron)\//u, reason: 'devDependencies' },
];

/** Runtime entry points that are not reached through import statements. */
export const EXTRA_RUNTIME_ENTRIES = ['dist/src/search/workspaceSearchWorkerThread.js'];

/** Human checks a candidate cannot prove by itself (ADR-0010 G1–G4). */
export const MANUAL_CHECKS = [
  { id: 'G1-preview', gate: 'ADR-0010 G1', check: '実VS Codeのプレビューで ![[...]] が描画され、スタイル・キャッシュ・scroll syncが保たれる' },
  { id: 'G2-print', gate: 'ADR-0010 G2', check: '基本設計書キットのcaption・相互参照・pageBreak・orientation・別紙カードがPDFまで再現する' },
  { id: 'G3-read-only', gate: 'ADR-0010 G3', check: '実データで原本ファイルのバイト列が操作の前後で変わらない' },
  { id: 'G4-limits', gate: 'ADR-0010 G4', check: '動かない条件が利用者向け文書の記述と一致する' },
  { id: 'vsix-install', gate: 'ADR-0025 D2', check: 'このVSIXを最低対応版と最新版のVS Codeに入れ、チュートリアルの最初の表が出る' },
];

// ── pure helpers (unit-tested in test/releaseCandidate.test.mjs) ──────────

/** Lists entry names from a ZIP central directory (VSIX files are ZIP). */
export function listZipEntries(buffer) {
  const minimum = 22;
  let eocd = -1;
  for (let offset = buffer.length - minimum; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file: end of central directory not found.');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`Corrupt ZIP central directory at entry ${index}.`);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    entries.push(buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Checks a VSIX entry list: required files present, forbidden files absent,
 * and every compiled module the extension loads at runtime shipped.
 */
export function auditVsixEntries(entries, runtimeModules = []) {
  const names = new Set(entries);
  const problems = [];
  for (const required of REQUIRED_VSIX_ENTRIES) {
    if (!names.has(required)) problems.push(`missing required entry ${required}`);
  }
  for (const entry of entries) {
    const hit = FORBIDDEN_VSIX_PATTERNS.find(({ pattern }) => pattern.test(entry));
    if (hit) problems.push(`forbidden entry ${entry} (${hit.reason})`);
  }
  for (const module of runtimeModules) {
    const entry = `extension/${module}`;
    if (!names.has(entry)) problems.push(`runtime module not shipped: ${entry}`);
  }
  return problems;
}

/** Returns the body of `## [version]` in a Keep a Changelog file, or undefined. */
export function changelogSection(changelog, version) {
  const lines = changelog.replace(/\r\n/gu, '\n').split('\n');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const start = lines.findIndex((line) => new RegExp(`^## \\[${escaped}\\]( - \\d{4}-\\d{2}-\\d{2})?\\s*$`, 'u').test(line));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## \[/u.test(line));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return { heading: lines[start], body };
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function minimumVersion(range) {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(range ?? '');
  return match ? match.slice(1).map(Number) : undefined;
}

/** Version facts that must agree before anything is built. */
export function checkVersionConsistency({ packageJson, packageLock, changelog, readme }) {
  const problems = [];
  const version = packageJson.version;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/u.test(version ?? '')) problems.push(`package.json version is not SemVer: ${version}`);
  if (packageLock.version !== version) problems.push(`package-lock.json version ${packageLock.version} != ${version}`);
  if (packageLock.packages?.['']?.version !== version) problems.push(`package-lock.json packages[""].version ${packageLock.packages?.['']?.version} != ${version}`);
  for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
    // A runtime dependency missing at the top of the lockfile is not installed
    // by `npm ci`, and the VSIX would then crash on import (npm 11's
    // `npm version` has been seen dropping such an entry).
    if (!packageLock.packages?.[`node_modules/${dependency}`]) problems.push(`package-lock.json has no top-level entry for runtime dependency ${dependency}`);
  }
  const section = changelogSection(changelog, version);
  if (!section) problems.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
  else if (!/ - \d{4}-\d{2}-\d{2}/u.test(section.heading)) problems.push(`CHANGELOG.md section for ${version} has no release date`);
  else if (section.body === '') problems.push(`CHANGELOG.md section for ${version} is empty`);
  const engine = minimumVersion(packageJson.engines?.vscode);
  const types = minimumVersion(packageJson.devDependencies?.['@types/vscode']);
  if (!engine) problems.push('package.json engines.vscode has no minimum version');
  if (engine && types && compareVersions(types, engine) > 0) {
    // vsce refuses @types/vscode newer than engines.vscode: the code could call APIs the floor lacks.
    problems.push(`@types/vscode ${types.join('.')} is newer than engines.vscode ${engine.join('.')}`);
  }
  if (engine && readme !== undefined) {
    const stated = /最低対応バージョンは\s*VS Code\s*(\d+\.\d+\.\d+)/u.exec(readme)?.[1];
    if (!stated) problems.push('README.md does not state the minimum VS Code version');
    else if (stated !== engine.join('.')) problems.push(`README.md minimum VS Code ${stated} != engines.vscode ${engine.join('.')}`);
  }
  return problems;
}

/** Sums node:test summary lines ("ℹ tests 12") over all lanes of one run. */
export function sumTestSummary(output) {
  const totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  for (const match of output.matchAll(/^ℹ (tests|pass|fail|skipped) (\d+)\s*$/gmu)) {
    totals[match[1]] += Number(match[2]);
  }
  return totals;
}

export function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** A candidate is releasable only when every automated step passed on a clean tree. */
export function isReleasable(evidence) {
  return evidence.source.dirty === false
    && evidence.steps.length > 0
    && evidence.steps.every((step) => step.status === 'passed' || (step.optional === true && step.status === 'not-run'));
}

// ── runner ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = { allowDirty: false, e2e: false, outDir: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--e2e') options.e2e = true;
    else if (arg === '--out') options.outDir = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function run(command, args, { cwd = PROJECT_ROOT, env } = {}) {
  const plan = spawnPlan(command, args);
  const result = spawnSync(plan.file, plan.args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024,
    shell: plan.shell,
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}` };
}

function tail(output, lines = 15) {
  return output.trim().split(/\r?\n/u).slice(-lines).join('\n');
}

function git(args) {
  const result = run('git', args, { cwd: REPO_ROOT });
  return result.status === 0 ? result.output.trim() : undefined;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: npm run release:candidate -- [--e2e] [--allow-dirty] [--out <dir>]');
    return 0;
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const outDir = path.resolve(options.outDir ?? path.join(REPO_ROOT, 'artifacts', 'release', version));
  const dirtyFiles = (git(['status', '--porcelain']) ?? '').split(/\r?\n/u).filter(Boolean);
  const evidence = {
    schema: EVIDENCE_SCHEMA,
    version,
    createdAt: new Date().toISOString(),
    source: {
      commit: git(['rev-parse', 'HEAD']) ?? 'unknown',
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown',
      dirty: dirtyFiles.length > 0,
      ...(dirtyFiles.length > 0 ? { dirtyFiles } : {}),
    },
    environment: { os: `${os.platform()} ${os.release()}`, arch: os.arch(), node: process.version },
    steps: [],
    artifacts: [],
    manualChecks: MANUAL_CHECKS.map((check) => ({ ...check, status: 'not-run' })),
  };

  const step = async (id, body, { optional = false } = {}) => {
    const started = Date.now();
    process.stdout.write(`[release] ${id} ... `);
    let record;
    try {
      const result = (await body()) ?? {};
      record = { id, status: result.status ?? 'passed', ...(result.detail ? { detail: result.detail } : {}), ...(result.data ? { data: result.data } : {}) };
    } catch (error) {
      record = { id, status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
    record.durationMs = Date.now() - started;
    if (optional) record.optional = true;
    evidence.steps.push(record);
    console.log(record.status);
    if (record.status === 'failed' && record.detail) console.log(record.detail.split('\n').map((line) => `    ${line}`).join('\n'));
    return record.status === 'passed' || record.status === 'not-run';
  };
  const ok = () => evidence.steps.every((entry) => entry.status !== 'failed');

  await step('source-clean', () => {
    if (!evidence.source.dirty) return {};
    if (options.allowDirty) return { status: 'failed', detail: `--allow-dirty: ${dirtyFiles.length} uncommitted file(s); this candidate is a rehearsal and not releasable` };
    throw new Error(`Uncommitted changes (${dirtyFiles.length}). Commit them, or pass --allow-dirty for a rehearsal.\n${dirtyFiles.slice(0, 10).join('\n')}`);
  });
  if (!ok() && !options.allowDirty) return finish(evidence, outDir);

  await step('version-consistency', () => {
    const problems = checkVersionConsistency({
      packageJson,
      packageLock: JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package-lock.json'), 'utf8')),
      changelog: fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8'),
      readme: fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8'),
    });
    if (problems.length > 0) throw new Error(problems.join('\n'));
  });

  await step('build', () => {
    const result = run('npm', ['run', 'build']);
    if (result.status !== 0) throw new Error(`npm run build failed\n${tail(result.output)}`);
  });

  await step('product-tests', () => {
    const result = run('npm', ['test']);
    const totals = sumTestSummary(result.output);
    if (result.status !== 0) throw new Error(`npm test failed (${JSON.stringify(totals)})\n${tail(result.output, 25)}`);
    if (totals.tests === 0) throw new Error('npm test reported no tests');
    return { detail: `${totals.pass} passed, ${totals.skipped} skipped, ${totals.fail} failed`, data: totals };
  });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const vsixPath = path.join(outDir, `${packageJson.name}-${version}.vsix`);

  await step('vsix-package', () => {
    const result = run('npx', ['vsce', 'package', '--no-update-package-json', '--out', vsixPath]);
    if (result.status !== 0 || !fs.existsSync(vsixPath)) throw new Error(`vsce package failed\n${tail(result.output)}`);
    return { detail: `${Math.round(fs.statSync(vsixPath).size / 1024)} KiB` };
  });

  await step('vsix-audit', () => {
    if (!fs.existsSync(vsixPath)) return { status: 'not-run', detail: 'no VSIX' };
    const entries = listZipEntries(fs.readFileSync(vsixPath));
    const distRoot = path.join(PROJECT_ROOT, 'dist');
    const runtime = new Set();
    for (const entry of [packageJson.main.replace(/^\.\//u, ''), ...EXTRA_RUNTIME_ENTRIES]) {
      for (const module of collectRuntimeModuleGraph(path.join(PROJECT_ROOT, entry), distRoot)) runtime.add(`dist/${module}`);
    }
    const problems = auditVsixEntries(entries, [...runtime]);
    if (problems.length > 0) throw new Error(problems.slice(0, 30).join('\n'));
    return { detail: `${entries.length} entries, ${runtime.size} runtime modules all shipped`, data: { entries: entries.length, runtimeModules: runtime.size } };
  });

  const cliDir = path.join(outDir, 'cli');
  await step('cli-package', async () => {
    // Builds the self-contained tarball and installs it offline into an empty
    // prefix with an empty npm cache (verify-cli-package.mjs). A failed
    // verification deletes the tarball, so nothing unverified is left behind.
    const result = buildCliPackage({ outputDirectory: cliDir });
    if (!result.verification || !fs.existsSync(result.tarballPath)) throw new Error('CLI package was built without a passing offline verification');
    return { detail: path.basename(result.tarballPath) };
  });

  await step('extension-host-e2e', () => {
    if (!options.e2e) return { status: 'not-run', detail: 'pass --e2e to run (downloads VS Code on first use)' };
    const result = process.platform === 'win32'
      ? run('node', ['--import', 'tsx', './test/e2e/runTest.ts'], { env: { MMI_ENABLE_TEST_COMMANDS: '1' } })
      : run('bash', ['./scripts/run-vscode-e2e.sh']);
    if (result.status !== 0) throw new Error(`Extension Host E2E failed\n${tail(result.output, 25)}`);
    return { detail: 'passed' };
  }, { optional: true });

  return finish(evidence, outDir, vsixPath, cliDir);
}

function finish(evidence, outDir, vsixPath, cliDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [vsixPath, ...(cliDir && fs.existsSync(cliDir) ? fs.readdirSync(cliDir).filter((name) => name.endsWith('.tgz')).map((name) => path.join(cliDir, name)) : [])]
    .filter((file) => file && fs.existsSync(file));
  evidence.artifacts = files.map((file) => ({
    path: path.relative(outDir, file).split(path.sep).join('/'),
    bytes: fs.statSync(file).size,
    sha256: sha256File(file),
  }));
  evidence.releasable = isReleasable(evidence);
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), evidence.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).join('\n') + (evidence.artifacts.length ? '\n' : ''));
  const section = changelogSection(fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8'), evidence.version);
  fs.writeFileSync(path.join(outDir, 'RELEASE_NOTES.md'), renderReleaseNotes(evidence, section?.body));
  fs.writeFileSync(path.join(outDir, 'release-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[release] evidence: ${path.join(outDir, 'release-evidence.json')}`);
  console.log(`[release] releasable: ${evidence.releasable}${evidence.releasable ? ' (manual checks are listed as not-run in the evidence)' : ''}`);
  return evidence.releasable ? 0 : 1;
}

export function renderReleaseNotes(evidence, changelogBody) {
  const lines = [
    `# Markdown Matrix Injector ${evidence.version}`,
    '',
    `Commit: \`${evidence.source.commit}\`${evidence.source.dirty ? ' (uncommitted changes: rehearsal only)' : ''}`,
    '',
    changelogBody ?? '_CHANGELOG.md has no section for this version._',
    '',
    '## Artifacts',
    '',
    '| File | SHA-256 |',
    '| --- | --- |',
    ...evidence.artifacts.map((artifact) => `| \`${artifact.path}\` | \`${artifact.sha256}\` |`),
    '',
    '## Verification',
    '',
    '| Step | Result | Detail |',
    '| --- | --- | --- |',
    ...evidence.steps.map((entry) => `| ${entry.id} | ${entry.status} | ${(entry.detail ?? '').split('\n')[0].replaceAll('|', '\\|')} |`),
    '',
    `Environment: ${evidence.environment.os}, ${evidence.environment.arch}, Node ${evidence.environment.node}`,
    '',
    '## Manual checks (not proven by this candidate)',
    '',
    ...evidence.manualChecks.map((check) => `- [ ] ${check.gate}: ${check.check}`),
    '',
  ];
  return lines.join('\n');
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error);
    process.exit(1);
  });
}
