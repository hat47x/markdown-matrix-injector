import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { createAiHandoffPackage } from '../src/dx/aiHandoff.js';
import {
  AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
  validateAiHandoffCandidateSelection,
} from '../src/dx/aiHandoffCandidateSelectionValidation.js';

function candidate(): Candidate {
  const sourceDigest = fingerprintOf('source-bytes-v1', 'source').digest;
  return {
    kind: 'table-range',
    locator: { source: './design.xlsx', sourceDigest, sheet: '画面', range: 'A1:B3' },
    status: 'inferred',
    execution: 'deterministic',
    method: 'M1',
    claims: [{
      aspect: 'header',
      status: 'inferred',
      execution: 'deterministic',
      method: 'M1',
      reasonCode: 'header-likely',
    }],
    provenance: {
      algorithm: 'test',
      run: { execution: 'deterministic', inputDigest: sourceDigest, config: {}, implementationVersion: '1' },
    },
    fingerprint: fingerprintOf('table-display-cells-v1', 'content'),
    scores: [],
  };
}

test('accepts only a Candidate identity that was present in the handoff', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const result = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: '提示された候補の中で依頼対象に一致するため',
    unresolved: ['semantic role remains inferred'],
  });
  assert.equal(result.status, 'accepted-for-review');
  assert.equal(result.selected[0].digest, identity.digest);
  assert.equal(result.checks.at(-1)?.code, 'CANDIDATE_SELECTION_NO_AUTHORITY_ESCALATION');
});

test('blocks a fabricated Candidate identity even when its shape is valid', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const fabricated = {
    algorithm: 'sha256' as const,
    representation: 'mmi-candidate-occurrence-content-v1' as const,
    digest: fingerprintOf('fabricated', 'candidate').digest,
  };
  const result = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [fabricated],
    rationale: '外部モデルが生成した候補',
    unresolved: [],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.at(-1)?.code, 'CANDIDATE_SELECTION_NOT_IN_HANDOFF');
});

test('proposal receipt digest changes when nested selection content changes', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const first = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: 'A',
    unresolved: [],
  });
  const second = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: 'B',
    unresolved: [],
  });
  assert.notEqual(first.proposalDigest, second.proposalDigest);
});


test('proposal schema rejects authority-expanding or executable extra fields', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  for (const extra of [
    { status: 'confirmed' },
    { command: 'rm -rf /' },
    { outputPath: '../../outside.md' },
  ]) {
    const result = validateAiHandoffCandidateSelection(handoff, {
      schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
      selected: [identity],
      rationale: '候補を選ぶ',
      unresolved: [],
      ...extra,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.checks.at(-1)?.code, 'CANDIDATE_SELECTION_SCHEMA_INVALID');
  }
});

test('proposal receipt digest binds nested Candidate identity content', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const first = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: '同じ理由',
    unresolved: [],
  });
  const second = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [{
      ...identity,
      digest: fingerprintOf('fabricated', 'different-candidate').digest,
    }],
    rationale: '同じ理由',
    unresolved: [],
  });
  assert.notEqual(first.proposalDigest, second.proposalDigest);
});

test('Candidate identity objects reject extra fields', () => {
  const handoff = createAiHandoffPackage({ task: '取り込む候補を選ぶ', candidates: [candidate()] });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const result = validateAiHandoffCandidateSelection(handoff, {
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [{ ...identity, authority: 'confirmed' }],
    rationale: '候補を選ぶ',
    unresolved: [],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.at(-1)?.code, 'CANDIDATE_SELECTION_SCHEMA_INVALID');
});


async function captureMain(argv: string[]): Promise<{ code: number; output: string }> {
  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    return { code: await main(argv), output: written.join('') };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('CLI validate-selection exposes review-only allowlist validation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-selection-cli-'));
  const handoff = createAiHandoffPackage({
    task: '取り込む候補を選ぶ',
    candidates: [candidate()],
  });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const handoffPath = path.join(root, 'handoff.json');
  const proposalPath = path.join(root, 'selection.json');
  fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
  fs.writeFileSync(proposalPath, JSON.stringify({
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: '提示候補から選ぶ',
    unresolved: [],
  }, null, 2));

  const accepted = await captureMain([
    'validate-selection',
    proposalPath,
    '--package',
    handoffPath,
    '--root',
    root,
    '--json',
  ]);
  assert.equal(accepted.code, 0);
  assert.equal(JSON.parse(accepted.output).status, 'accepted-for-review');

  fs.writeFileSync(proposalPath, JSON.stringify({
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [{
      ...identity,
      digest: fingerprintOf('fabricated', 'candidate').digest,
    }],
    rationale: '捏造候補',
    unresolved: [],
  }));
  const blocked = await captureMain([
    'validate-selection',
    proposalPath,
    '--package',
    handoffPath,
    '--root',
    root,
    '--json',
  ]);
  assert.equal(blocked.code, 1);
  assert.equal(JSON.parse(blocked.output).status, 'blocked');
});

test('CLI validate-selection refuses proposal/package files outside the workspace', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-selection-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-selection-outside-'));
  const handoff = createAiHandoffPackage({
    task: '取り込む候補を選ぶ',
    candidates: [candidate()],
  });
  const identity = handoff.inferredCandidates[0].candidateIdentity;
  const insideHandoff = path.join(root, 'handoff.json');
  const outsideHandoff = path.join(outside, 'handoff.json');
  const insideProposal = path.join(root, 'selection.json');
  const outsideProposal = path.join(outside, 'selection.json');
  const proposalJson = JSON.stringify({
    schema: AI_HANDOFF_CANDIDATE_SELECTION_SCHEMA,
    selected: [identity],
    rationale: '候補',
    unresolved: [],
  });
  fs.writeFileSync(insideHandoff, JSON.stringify(handoff));
  fs.writeFileSync(outsideHandoff, JSON.stringify(handoff));
  fs.writeFileSync(insideProposal, proposalJson);
  fs.writeFileSync(outsideProposal, proposalJson);

  assert.equal((await captureMain([
    'validate-selection',
    outsideProposal,
    '--package',
    insideHandoff,
    '--root',
    root,
  ])).code, 2);

  assert.equal((await captureMain([
    'validate-selection',
    insideProposal,
    '--package',
    outsideHandoff,
    '--root',
    root,
  ])).code, 2);
});
