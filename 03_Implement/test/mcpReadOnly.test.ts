import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMcpServer, MCP_PROTOCOL_VERSION, MCP_TOOL_NAMES } from '../src/cli/mcp.js';
import { readHtmlFragments, selectHtmlFragmentById } from '../src/adapters/htmlFragmentAdapter.js';
import { commitHtmlDecomposition } from '../src/application/commitHtmlDecomposition.js';
import { createSourceIdentityFromBytes } from '../src/core/sourceIdentity.js';
import { AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA } from '../src/dx/aiHandoffCandidateSelectionValidation.js';
import { AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA } from '../src/dx/aiHandoffTransformationValidation.js';

/**
 * Issue #701: the MCP server is read-only for every tool it publishes, also on
 * the real kit (xlsx) and inside a Git work tree, where `.git` must not change.
 */

const KIT = fileURLToPath(new URL('../../04_Documentation/kits/basic-design', import.meta.url));
const MONOLITH = fileURLToPath(new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url));
const SOURCE = 'masters/基本設計.xlsx';
const DOCUMENT = '基本設計書.md';
const TABLE = '機能一覧!A1:F11';

interface FileState {
  size: number;
  mtimeMs: number;
  digest: string;
}

/** Relative path (POSIX separators) to size, mtime and content digest, including `.git`. */
function snapshot(root: string): Map<string, FileState> {
  const states = new Map<string, FileState>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        states.set(`${rel}/`, { size: 0, mtimeMs: 0, digest: 'dir' });
        walk(full);
      } else {
        const stat = fs.statSync(full);
        states.set(rel, {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          digest: createHash('sha256').update(fs.readFileSync(full)).digest('hex'),
        });
      }
    }
  };
  walk(root);
  return states;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', [
    '-c', 'user.name=mmi-test', '-c', 'user.email=mmi-test@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false',
    ...args,
  ], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
}

async function rpc(server: ReturnType<typeof createMcpServer>, id: number, method: string, params?: unknown): Promise<any> {
  const line = await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  return JSON.parse(line ?? '{}');
}

test('every published MCP tool leaves a Git-managed workspace unchanged, .git included', async (t) => {
  const gitProbe = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (gitProbe.status !== 0) {
    t.skip('git is not available');
    return;
  }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-mcp-readonly-'));
  const root = path.join(base, 'kit');
  try {
    fs.cpSync(KIT, root, { recursive: true });

    // Fixtures for the tools that need more than the kit: an HTML decomposition
    // for html-audit, and a handoff package plus proposals for validate-*.
    const html = fs.readFileSync(MONOLITH, 'utf8');
    const htmlDigest = createSourceIdentityFromBytes(Buffer.from(html, 'utf8')).digest;
    fs.writeFileSync(path.join(root, 'monolith.html'), html);
    const parsed = readHtmlFragments(html, 'monolith.html', htmlDigest);
    const selections = ['overview', 'api'].map((id) => ({
      id,
      output: `docs/${id}.html`,
      expectedFingerprint: selectHtmlFragmentById(parsed, id).candidate.fingerprint.digest,
    }));
    fs.writeFileSync(path.join(root, 'reviewed.json'), JSON.stringify({ sourceDigest: htmlDigest, fragments: selections }));
    commitHtmlDecomposition({
      workspaceRoot: root,
      sourcePath: path.join(root, 'monolith.html'),
      ledgerPath: path.join(root, 'mmi-ledger.json'),
      selections,
      expectedSourceDigest: htmlDigest,
    });

    const server = createMcpServer({ root, version: 'readonly-test' });
    const init = await rpc(server, 1, 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'readonly', version: '0' },
    });
    assert.equal(init.result.protocolVersion, MCP_PROTOCOL_VERSION);

    const called = new Set<string>();
    let nextId = 10;
    const call = async (name: string, args: unknown): Promise<any> => {
      called.add(name);
      const response = await rpc(server, nextId++, 'tools/call', { name, arguments: args });
      assert.equal(response.error, undefined, `${name}: ${JSON.stringify(response.error)}`);
      return response.result;
    };
    const json = (result: any): any => JSON.parse(result.content[0].text);

    // The handoff package and proposals are written by the test, before the
    // snapshot, because the server itself must not write them.
    const handoffResult = await call('handoff', { source: SOURCE, task: '参照案を提案する', document: DOCUMENT });
    assert.equal(handoffResult.isError, false);
    const handoff = json(handoffResult);
    fs.writeFileSync(path.join(root, 'handoff.json'), JSON.stringify(handoff));
    const identity = handoff.inferredCandidates[0].candidateIdentity;
    fs.writeFileSync(path.join(root, 'selection.json'), JSON.stringify({
      schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
      selected: [identity],
      rationale: '提示候補から選ぶ',
      unresolved: [],
    }));
    fs.writeFileSync(path.join(root, 'transformation.json'), JSON.stringify({
      schema: AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA,
      candidate: identity,
      targetState: 'linked',
      rationale: '提示されたCandidateを既存MMI経路で利用する',
      unresolved: [],
    }));

    git(root, ['init', '-q']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'fixture']);

    // A tool whose name suggests writing must not be published.
    const listed = await rpc(server, 2, 'tools/list');
    const names: string[] = listed.result.tools.map((tool: { name: string }) => tool.name);
    assert.deepEqual([...names].sort(), [...MCP_TOOL_NAMES].sort());
    for (const name of names) {
      assert.doesNotMatch(name, /extract|import|materialize|commit|snapshot|write|save|apply|delete|remove/u,
        `tool ${name} looks like a write operation`);
    }

    const before = snapshot(root);
    assert.ok(before.has('.git/index'), '.git must be part of the snapshot');

    const results: Record<string, any> = {
      schema: await call('schema', { contract: 'candidate' }),
      inspect: await call('inspect', { source: SOURCE, values: 1 }),
      'html-audit': await call('html-audit', { source: 'monolith.html', plan: 'reviewed.json' }),
      check: await call('check', { paths: ['.'] }),
      render: await call('render', { document: DOCUMENT }),
      select: await call('select', { source: SOURCE, table: TABLE, columns: '機能ID,機能名', first: 3 }),
      find: await call('find', { query: '機能一覧' }),
      handoff: await call('handoff', { source: SOURCE, task: '参照案を提案する', document: DOCUMENT }),
      'validate-proposal': await call('validate-proposal', {
        notation: `![[./${SOURCE}#機能一覧|A1:F11?header=first]]`,
        package: 'handoff.json',
        document: DOCUMENT,
      }),
      'validate-selection': await call('validate-selection', { proposal: 'selection.json', package: 'handoff.json' }),
      'validate-transformation': await call('validate-transformation', {
        proposal: 'transformation.json',
        package: 'handoff.json',
        document: DOCUMENT,
      }),
    };
    await call('render', { document: DOCUMENT, to: 'html' });
    for (const contract of ['ledger', 'review-decisions']) await call('schema', { contract });
    await call('select', { source: SOURCE, table: TABLE, expectedSourceDigest: json(results.select).sourceDigest });

    // Each tool must have run its real path, not stopped at argument checking.
    for (const [name, result] of Object.entries(results)) {
      assert.equal(result.isError, false, `${name} failed: ${result.content?.[0]?.text}`);
    }
    assert.equal(json(results.select).result.ok, true);
    assert.equal(json(results['html-audit']).status, 'complete');
    assert.equal(json(results['validate-selection']).status, 'accepted-for-review');
    assert.equal(json(results['validate-proposal']).status, 'accepted');
    assert.equal(json(results['validate-transformation']).status, 'accepted-for-review');

    assert.deepEqual([...called].sort(), [...MCP_TOOL_NAMES].sort(),
      'the read-only test must call every tool in MCP_TOOL_NAMES; add the new tool here');

    const after = snapshot(root);
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'files were added or removed');
    for (const [rel, state] of before) {
      assert.deepEqual(after.get(rel), state, `${rel} changed`);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
