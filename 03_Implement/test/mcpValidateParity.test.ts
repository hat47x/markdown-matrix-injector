import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { createMcpServer, MCP_PROTOCOL_VERSION } from '../src/cli/mcp.js';
import { AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA } from '../src/dx/aiHandoffCandidateSelectionValidation.js';
import { AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA } from '../src/dx/aiHandoffTransformationValidation.js';

/**
 * Issue #746: validate-proposal / validate-selection / validate-transformation
 * return the same JSON through MCP as through `mmi validate-* --json`, and the
 * "not accepted" results are ordinary tool results (isError false) that the
 * MCP path reproduces after the source changed or the proposal is invalid.
 */

const SOURCE = 'data/release.csv';
const DOCUMENT = 'spec.md';
const NOTATION = `![[./${SOURCE}#Sheet1|A1:B2?header=first&mode=table]]`;
const FABRICATED = `sha256:${'a'.repeat(64)}`;

/** Runs `mmi <args> --root . --json` in-process with cwd set to root, like the CLI would see it. */
async function runCli(root: string, args: readonly string[]): Promise<{ status: number; stdout: string }> {
  const previous = process.cwd();
  const written: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  const logError = console.error;
  process.chdir(root);
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    const status = await main([...args, '--root', '.', '--json']);
    return { status, stdout: written.join('') };
  } finally {
    process.stdout.write = write;
    console.error = logError;
    process.chdir(previous);
  }
}

async function rpc(server: ReturnType<typeof createMcpServer>, id: number, method: string, params?: unknown): Promise<any> {
  const response = await server.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  return JSON.parse(response ?? '{}');
}

function check(result: any, name: string): any {
  return result.checks.find((item: { check: string }) => item.check === name);
}

test('validate-* match the CLI for accepted and blocked results, and stay ordinary results after the source changed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-mcp-validate-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, DOCUMENT), '# Spec\n');
    fs.writeFileSync(path.join(root, SOURCE), 'ID,State\n1,ready\n');

    const server = createMcpServer({ root, version: 'validate-parity-test' });
    const init = await rpc(server, 1, 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'parity', version: '0' },
    });
    assert.equal(init.result.protocolVersion, MCP_PROTOCOL_VERSION);
    let nextId = 10;
    const call = async (name: string, args: unknown): Promise<any> => {
      const response = await rpc(server, nextId++, 'tools/call', { name, arguments: args });
      assert.equal(response.error, undefined, `${name}: ${JSON.stringify(response.error)}`);
      return response.result;
    };

    const handoffResult = await call('handoff', { source: SOURCE, task: 'このCandidateを成果物へ進める案をレビューする', document: DOCUMENT });
    assert.equal(handoffResult.isError, false);
    const handoff = JSON.parse(handoffResult.content[0].text);
    fs.writeFileSync(path.join(root, 'handoff.json'), JSON.stringify(handoff));
    const offered = [...handoff.confirmedFacts, ...handoff.inferredCandidates][0];
    assert.ok(offered, 'the fixture must offer at least one Candidate');
    const identity = offered.candidateIdentity;
    const fabricated = { ...identity, digest: FABRICATED };

    const write = (file: string, value: unknown): void => {
      fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    };
    const selection = (selected: unknown[]) => ({
      schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA, selected, rationale: '提示候補から選ぶ', unresolved: [],
    });
    const transformation = (candidate: unknown) => ({
      schema: AI_HANDOFF_TRANSFORMATION_PROPOSAL_SCHEMA,
      candidate,
      targetState: 'extracted',
      rationale: '提示されたCandidateを成果物へ進める',
      unresolved: [],
    });
    write('selection-ok.json', selection([identity]));
    write('selection-unknown.json', selection([fabricated]));
    write('selection-schema.json', { schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA });
    write('transformation-ok.json', transformation(identity));
    write('transformation-unknown.json', transformation(fabricated));

    interface Case { name: string; tool: string; cli: string[]; mcp: Record<string, unknown>; status: string }
    const proposalCase = (name: string, notation: string, status: string): Case => ({
      name,
      tool: 'validate-proposal',
      cli: ['validate-proposal', notation, '--package', 'handoff.json', '--document', DOCUMENT],
      mcp: { notation, package: 'handoff.json', document: DOCUMENT },
      status,
    });
    const selectionCase = (name: string, proposal: string, status: string): Case => ({
      name,
      tool: 'validate-selection',
      cli: ['validate-selection', proposal, '--package', 'handoff.json'],
      mcp: { proposal, package: 'handoff.json' },
      status,
    });
    const transformationCase = (name: string, proposal: string, status: string): Case => ({
      name,
      tool: 'validate-transformation',
      cli: ['validate-transformation', proposal, '--package', 'handoff.json', '--document', DOCUMENT],
      mcp: { proposal, package: 'handoff.json', document: DOCUMENT },
      status,
    });

    const cases: Case[] = [
      proposalCase('proposal accepted', NOTATION, 'accepted'),
      proposalCase('proposal prose', '担当者別に集計してください', 'blocked'),
      selectionCase('selection accepted', 'selection-ok.json', 'accepted-for-review'),
      selectionCase('selection outside the handoff', 'selection-unknown.json', 'blocked'),
      selectionCase('selection schema invalid', 'selection-schema.json', 'blocked'),
      transformationCase('transformation accepted', 'transformation-ok.json', 'accepted-for-review'),
      transformationCase('transformation outside the handoff', 'transformation-unknown.json', 'blocked'),
    ];

    const compare = async (item: Case): Promise<any> => {
      const cli = await runCli(root, item.cli);
      const result = await call(item.tool, item.mcp);
      assert.equal(result.isError, false, `${item.name}: ${result.content?.[0]?.text}`);
      const mcp = JSON.parse(result.content[0].text);
      assert.deepEqual(mcp, JSON.parse(cli.stdout), `${item.name}: MCP and CLI JSON differ`);
      assert.equal(cli.status, item.status.startsWith('accepted') ? 0 : 1, `${item.name}: exit code`);
      return mcp;
    };

    // Before the source changes: accepted and rejected cases agree with the CLI.
    const before: Record<string, any> = {};
    for (const item of cases) {
      before[item.name] = await compare(item);
      assert.equal(before[item.name].status, item.status, item.name);
    }
    assert.equal(check(before['selection outside the handoff'], 'candidate-allowlist').code, 'CANDIDATE_SELECTION_NOT_IN_HANDOFF');
    assert.equal(check(before['selection schema invalid'], 'proposal-schema').code, 'CANDIDATE_SELECTION_SCHEMA_INVALID');
    assert.equal(check(before['selection schema invalid'], 'candidate-allowlist'), undefined);
    assert.equal(check(before['transformation outside the handoff'], 'candidate-allowlist').code, 'TRANSFORMATION_CANDIDATE_NOT_IN_HANDOFF');
    assert.equal(check(before['transformation outside the handoff'], 'source-identity').status, 'not-run');
    assert.equal(check(before['proposal prose'], 'parser').code, 'PROPOSAL_NOT_SINGLE_MMI_EMBED');
    assert.equal(check(before['proposal accepted'], 'source-identity').code, 'PROPOSAL_SOURCE_DIGEST_MATCHED');

    // After the source changed, an older handoff no longer yields an accepted
    // proposal or transformation. The MCP result is still a normal result.
    fs.appendFileSync(path.join(root, SOURCE), '2,changed\n');
    const proposal = await compare(proposalCase('proposal after update', NOTATION, 'blocked'));
    assert.equal(proposal.status, 'blocked');
    assert.equal(check(proposal, 'source-identity').code, 'PROPOSAL_SOURCE_DIGEST_MISMATCH');
    const transform = await compare(transformationCase('transformation after update', 'transformation-ok.json', 'blocked'));
    assert.equal(transform.status, 'blocked');
    assert.equal(check(transform, 'source-identity').code, 'TRANSFORMATION_SOURCE_DIGEST_MISMATCH');
    assert.equal(check(transform, 'current-candidate').status, 'not-run');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
