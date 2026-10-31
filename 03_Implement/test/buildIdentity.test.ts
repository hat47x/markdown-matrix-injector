import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BUILD_IDENTITY_SCHEMA,
  gitDirty,
  readBuildIdentity,
  sha256Digest,
} from '../src/cli/buildIdentity.js';
import { createMcpServer } from '../src/cli/mcp.js';
import { readCliVersion } from '../src/cli/mmi.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('開発用チェックアウトでは、gitのHEAD・lockfile digest・Node版・提供形態を返す', () => {
  const identity = readBuildIdentity('9.9.9');
  assert.equal(identity.schema, BUILD_IDENTITY_SCHEMA);
  assert.equal(identity.version, '9.9.9');
  assert.equal(identity.distribution, 'checkout');
  assert.equal(identity.node.version, process.version);
  assert.equal(identity.node.major, Number.parseInt(process.versions.node, 10));
  assert.equal(
    identity.lockfileDigest,
    sha256Digest(fs.readFileSync(path.join(PROJECT_ROOT, 'package-lock.json'))),
  );
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  if (head.status === 0) assert.equal(identity.commit, head.stdout.trim());
  else assert.equal(identity.commit, null);
});

test('チェックアウトのdirtyは真偽値かnullで、gitHEADが取れるならnullでない', () => {
  const identity = readBuildIdentity('9.9.9');
  assert.ok(identity.dirty === null || typeof identity.dirty === 'boolean');
  if (identity.commit !== null) assert.equal(typeof identity.dirty, 'boolean');
});

test('gitDirtyは、変更なし・変更あり・追跡対象外のファイル・git管理外を区別する', (t) => {
  const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const probe = git(os.tmpdir(), '--version');
  if (probe.status !== 0) {
    t.skip('git is not available');
    return;
  }
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-dirty-'));
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-nogit-'));
  try {
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 't@example.invalid');
    git(repo, 'config', 'user.name', 't');
    git(repo, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    git(repo, 'add', 'a.txt');
    assert.equal(git(repo, 'commit', '-q', '-m', 'init').status, 0);
    assert.equal(gitDirty(repo), false);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
    assert.equal(gitDirty(repo), true);
    git(repo, 'checkout', '--', 'a.txt');
    assert.equal(gitDirty(repo), false);
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'x\n');
    assert.equal(gitDirty(repo), true);
    // 親にgitリポジトリが無い場所では、推測せずnullを返す。
    assert.equal(gitDirty(plain), null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(plain, { recursive: true, force: true });
  }
});

test('mmi --version --json は識別を返し、--versionだけなら版番号のみ返す', () => {
  const run = (args: string[]) => spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/mmi.ts', ...args],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
  const plain = run(['--version']);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout.trim(), readCliVersion());
  const json = run(['--version', '--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), readBuildIdentity(readCliVersion()));
});

test('MCPのinitializeは_metaにビルド識別を載せる', async () => {
  const server = createMcpServer({ root: PROJECT_ROOT, version: 'test-version' });
  const line = await server.handleLine(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } },
  }));
  const response = JSON.parse(line ?? '{}');
  assert.deepEqual(
    response.result._meta['mmi/buildIdentity'],
    readBuildIdentity('test-version'),
  );
  assert.equal(response.result.serverInfo.name, 'markdown-matrix-injector');
});

test('package.jsonのengines.nodeは、文書が書くNode.js 20以上と一致する', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=20');
  for (const doc of ['ci.md', 'ai-agent-guide.md']) {
    const text = fs.readFileSync(path.join(PROJECT_ROOT, '..', '04_Documentation', doc), 'utf8');
    assert.match(text, /Node\.js 20以上/u, doc);
  }
});
