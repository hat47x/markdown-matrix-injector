import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fingerprintOf, type Candidate } from '../src/core/candidate.js';
import { readSourceFileIdentity } from '../src/core/sourceIdentity.js';
import { createAiHandoffPackage } from '../src/dx/aiHandoff.js';
import {
  AI_HANDOFF_PROPOSAL_VALIDATION_SCHEMA,
  validateAiHandoffNotationProposal,
} from '../src/dx/aiHandoffProposalValidation.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-ai-proposal-'));
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs);
  fs.mkdirSync(data);
  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'release.csv');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, 'ID,State\n1,ready\n');

  const sourceDigest = readSourceFileIdentity(sourcePath).digest;
  const candidate: Candidate = {
    kind: 'table-range',
    locator: {
      source: '../data/release.csv',
      sourceDigest,
      sheet: 'Sheet1',
      range: 'A1:B2',
    },
    status: 'observed',
    execution: 'deterministic',
    method: 'M0',
    claims: [{
      aspect: 'location',
      value: 'A1:B2',
      status: 'observed',
      execution: 'deterministic',
      method: 'M0',
      reasonCode: 'source-cell-coordinates',
    }],
    provenance: {
      algorithm: 'fixture',
      run: {
        execution: 'deterministic',
        inputDigest: sourceDigest,
        config: {},
        implementationVersion: '1',
      },
    },
    fingerprint: fingerprintOf('table-display-cells-v1', 'ID\u001fState\u001e1\u001fready'),
    scores: [],
    reference: '![[../data/release.csv#Sheet1|A1:B2?header=first]]',
  };

  return {
    root,
    markdownFilePath,
    sourcePath,
    handoff: createAiHandoffPackage({
      task: 'この表の参照案を提案する',
      candidates: [candidate],
    }),
  };
}

function check(
  result: Awaited<ReturnType<typeof validateAiHandoffNotationProposal>>,
  name: string,
) {
  return result.checks.find((item) => item.check === name);
}

test('accepts one allowlisted MMI embed after diagnostics, preview and source identity checks', async () => {
  const f = fixture();
  const result = await validateAiHandoffNotationProposal({
    handoff: f.handoff,
    rawNotation: '![[../data/release.csv#Sheet1|A1:B2?header=first&mode=table]]',
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.schema, AI_HANDOFF_PROPOSAL_VALIDATION_SCHEMA);
  assert.equal(result.status, 'accepted');
  assert.equal(check(result, 'parser')?.status, 'passed');
  assert.equal(check(result, 'source-allowlist')?.status, 'passed');
  assert.equal(check(result, 'diagnostics')?.status, 'passed');
  assert.equal(check(result, 'source-identity')?.code, 'PROPOSAL_SOURCE_DIGEST_MATCHED');
  assert.equal(check(result, 'preview')?.code, 'READ_ONLY_TABLE_PREVIEW_ACCEPTED');
});

test('blocks wrong sheets even when an LLM asks for card mode', async () => {
  const f = fixture();
  const result = await validateAiHandoffNotationProposal({
    handoff: f.handoff,
    rawNotation: '![[../data/release.csv#Missing|A1:B2?mode=card]]',
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(check(result, 'diagnostics')?.code, 'PROPOSAL_DIAGNOSTICS_BLOCKED');
  assert.match(check(result, 'diagnostics')?.detail ?? '', /MMI_SHEET_NOT_FOUND/u);
  assert.equal(check(result, 'preview')?.status, 'not-run');
});

test('blocks sources not present in the handoff package, including URL/outside-path proposals', async () => {
  const f = fixture();
  for (const rawNotation of [
    '![[../../outside.csv#Sheet1|A1:B2]]',
    '![[https://example.invalid/data.csv#Sheet1|A1:B2]]',
  ]) {
    const result = await validateAiHandoffNotationProposal({
      handoff: f.handoff,
      rawNotation,
      markdownFilePath: f.markdownFilePath,
      workspaceRoot: f.root,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(
      check(result, 'source-allowlist')?.code,
      'PROPOSAL_SOURCE_NOT_IN_HANDOFF',
    );
    assert.equal(check(result, 'diagnostics')?.status, 'not-run');
  }
});

test('blocks unsupported aggregation parameters instead of silently ignoring them', async () => {
  const f = fixture();
  const result = await validateAiHandoffNotationProposal({
    handoff: f.handoff,
    rawNotation: '![[../data/release.csv#Sheet1|A1:B2?aggregate=sum]]',
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(
    check(result, 'parameter-schema')?.code,
    'PROPOSAL_UNSUPPORTED_PARAMETER',
  );
  assert.match(check(result, 'parameter-schema')?.detail ?? '', /aggregate/u);
});

test('blocks arbitrary command/prose instead of treating it as an executable proposal', async () => {
  const f = fixture();
  for (const proposal of [
    'rm -rf /',
    '担当者別に集計してください',
    'この表を直して保存してください',
  ]) {
    const result = await validateAiHandoffNotationProposal({
      handoff: f.handoff,
      rawNotation: proposal,
      markdownFilePath: f.markdownFilePath,
      workspaceRoot: f.root,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(check(result, 'parser')?.code, 'PROPOSAL_NOT_SINGLE_MMI_EMBED');
    assert.equal(check(result, 'parameter-schema')?.status, 'not-run');
  }
});

test('blocks a proposal when the source changed after the handoff package was created', async () => {
  const f = fixture();
  fs.appendFileSync(f.sourcePath, '2,changed\n');

  const result = await validateAiHandoffNotationProposal({
    handoff: f.handoff,
    rawNotation: '![[../data/release.csv#Sheet1|A1:B3?header=first&mode=table]]',
    markdownFilePath: f.markdownFilePath,
    workspaceRoot: f.root,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(
    check(result, 'source-identity')?.code,
    'PROPOSAL_SOURCE_DIGEST_MISMATCH',
  );
  assert.equal(check(result, 'preview')?.status, 'not-run');
});
