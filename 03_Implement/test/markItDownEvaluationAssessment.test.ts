import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessMarkItDownEvaluation,
  readMarkItDownAssessmentSpec,
} from '../src/evaluation/markItDownEvaluationAssessment.js';
import { readMarkItDownEvaluationHandoff } from '../src/evaluation/markItDownEvaluationHandoff.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const handoffPath = path.join(
  here,
  'fixtures',
  'baseline-converter-markitdown-0.1.8-handoff-v1.json',
);
const specPath = path.join(
  here,
  'fixtures',
  'baseline-converter-markitdown-screen-design-assessment-v1.json',
);

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixtureReport(artifactRoot: string, markdown: string): string {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const artifactPath = path.join(artifactRoot, 'baseline.md');
  fs.writeFileSync(artifactPath, markdown);
  const bytes = fs.readFileSync(artifactPath);
  return JSON.stringify({
    schema: 'mmi.baseline-converter-evaluation/v1',
    converter: { id: 'microsoft.markitdown-cli', version: '0.1.8' },
    source: {
      label: 'issue-0194-screen-design-v1',
      digest: 'sha256:' + 'a'.repeat(64),
      sheetCount: 3,
      candidateCounts: { 'table-range': 3, image: 4 },
      images: [
        { sheet: '画面一覧', range: 'D1:F4', name: 'ログイン画面', digest: 'sha256:' + '1'.repeat(64) },
        { sheet: '画面一覧', range: 'A6', name: 'メニュー画面', digest: 'sha256:' + '2'.repeat(64) },
        { sheet: '画面一覧', range: 'I9:K11', name: 'ログイン画面(再掲)', digest: 'sha256:' + '1'.repeat(64) },
        { sheet: '遷移図', name: '遷移', digest: 'sha256:' + '2'.repeat(64) },
      ],
    },
    markdown: {
      artifact: 'baseline.md',
      digest: sha256(bytes),
      bytes: bytes.byteLength,
      sheetEvidence: [
        { sheet: '画面一覧', markdownHeadingPresent: true },
        { sheet: '遷移図', markdownHeadingPresent: true },
        { sheet: 'メモ', markdownHeadingPresent: false },
      ],
      tableSeparatorLineCount: 1,
      imageReferenceCount: 0,
    },
    reconciliation: {
      candidateAddressability: 'not-provided-by-baseline-artifact',
      automaticImportDecision: 'none',
    },
  });
}

test('assessment reports preservation/loss observations without scoring', () => {
  const handoff = readMarkItDownEvaluationHandoff(handoffPath);
  const spec = readMarkItDownAssessmentSpec(specPath);
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-assess-'));
  const markdown = [
    '## 画面一覧',
    '',
    '| 画面ID | 画面名 |',
    '| --- | --- |',
    '| S01 | ログイン |',
    '| S02 | メニュー |',
    '',
    '## 遷移図',
    '',
    '遷移図',
    '',
  ].join('\n');

  const assessment = assessMarkItDownEvaluation({
    handoff,
    spec,
    reportText: fixtureReport(artifactRoot, markdown),
    artifactRoot,
  });

  assert.deepEqual(assessment.observations.sheetHeadings, {
    present: ['画面一覧', '遷移図'],
    missing: ['メモ'],
  });
  assert.deepEqual(assessment.observations.textSentinels.present, [
    '画面ID', '画面名', 'S01', 'ログイン', 'S02', 'メニュー', '遷移図',
  ]);
  assert.deepEqual(assessment.observations.textSentinels.missing, ['画像なし']);
  assert.deepEqual(assessment.observations.tableStructure, {
    markdownTableSeparatorLineCount: 1,
    knownSourceTable: { sheet: '画面一覧', range: 'A1:B3' },
  });
  assert.deepEqual(assessment.observations.images, {
    sourceOccurrenceCount: 4,
    markdownImageReferenceCount: 0,
    sourceOccurrenceIdentityAvailableInEvidence: true,
    markdownCandidateAddressability: 'not-provided-by-baseline-artifact',
  });
  assert.deepEqual(assessment.interpretation_boundary, {
    no_quality_score: true,
    no_pass_fail_threshold: true,
    no_automatic_import_decision: true,
    findings_are_descriptive: true,
  });
  assert.equal('score' in assessment, false);
  assert.equal('passed' in assessment, false);
});

test('assessment spec is bound to the same handoff and source facts', () => {
  const handoff = readMarkItDownEvaluationHandoff(handoffPath);
  const spec = readMarkItDownAssessmentSpec(specPath);
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-assess-'));
  const markdown = '## 画面一覧\n\n## 遷移図\n\n## メモ\n';

  assert.throws(
    () => assessMarkItDownEvaluation({
      handoff,
      spec: { ...spec, handoff_request_id: 'other-request' },
      reportText: fixtureReport(artifactRoot, markdown),
      artifactRoot,
    }),
    /does not belong/u,
  );

  assert.throws(
    () => assessMarkItDownEvaluation({
      handoff,
      spec: {
        ...spec,
        source_facts: { ...spec.source_facts, image_occurrence_count: 3 },
      },
      reportText: fixtureReport(artifactRoot, markdown),
      artifactRoot,
    }),
    /image occurrence count/u,
  );
});

test('assessment spec refuses evaluative thresholds or incomplete boundaries', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-assess-spec-'));
  const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  raw.interpretation_boundary.no_pass_fail_threshold = false;
  const invalid = path.join(temp, 'invalid.json');
  fs.writeFileSync(invalid, JSON.stringify(raw));

  assert.throws(
    () => readMarkItDownAssessmentSpec(invalid),
    /no_pass_fail_threshold must be true/u,
  );

  const extra = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  extra.quality_score = 0.95;
  const extraPath = path.join(temp, 'extra.json');
  fs.writeFileSync(extraPath, JSON.stringify(extra));
  assert.throws(
    () => readMarkItDownAssessmentSpec(extraPath),
    /unexpected field: quality_score/u,
  );

  const drift = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  drift.observations.push('overall_quality_score');
  const driftPath = path.join(temp, 'drift.json');
  fs.writeFileSync(driftPath, JSON.stringify(drift));
  assert.throws(
    () => readMarkItDownAssessmentSpec(driftPath),
    /frozen descriptive observation set/u,
  );
});
