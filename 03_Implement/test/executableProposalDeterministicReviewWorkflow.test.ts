import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  WorkbookData,
} from '../src/core/workbookLoader.js';
import {
  adaptClosedChoiceResponse,
} from '../src/experimental/closedChoiceJudgment.js';
import {
  createCognitiveReviewEnvelope,
} from '../src/experimental/cognitiveReviewEnvelope.js';
import {
  createContainedCognitiveObservation,
} from '../src/experimental/cognitiveSourceObservation.js';
import {
  EXECUTABLE_PROPOSAL_DETERMINISTIC_REVIEW_SURFACE_SCHEMA_VERSION,
  prepareExecutableProposalDeterministicReviewWithDefaultLoader,
  prepareExecutableProposalDeterministicReviewWithLoader,
} from '../src/experimental/executableProposalDeterministicReviewWorkflow.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  formatProfileToWorksheetPrototype,
} from '../src/experimental/formatProfile.js';
import {
  adaptWorksheetFormatMatchToCognitiveOutcome,
} from '../src/experimental/flyWorksheetFormatPerceptionProvider.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  matchWorksheetFormatSnapshot,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  WORKSHEET_FORMAT_FEATURE_VERSION,
} from '../src/experimental/worksheetFormatPrototype.js';

const BASE_HEADERS = [
  'ID',
  'Item',
  'Type',
  'Required',
  'Decision',
  'Reviewer',
] as const;

const DRIFT_HEADERS = [
  'Code',
  'Item',
  'Name',
  'Required',
  'Decision',
  'Reviewer',
] as const;

const TABLE =
  '![[../data/release.csv#Sheet1|A1:F4?header=first&mode=table]]';

function snapshot(
  headers: readonly string[],
): WorksheetFormatSnapshot {
  const cells: WorksheetFormatSnapshot['cells'][number][] = [
    { row: 0, column: 0, text: 'Release Table' },
  ];

  headers.forEach((header, column) => {
    cells.push({
      row: 1,
      column,
      text: header,
      fillTone: 'dark',
    });
  });

  for (let row = 2; row < 5; row += 1) {
    headers.forEach((_, column) => {
      cells.push({
        row,
        column,
        text: `r${row - 1}c${column + 1}`,
      });
    });
  }

  return {
    cells,
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: headers.length - 1,
    }],
  };
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-proposal-deterministic-review-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  fs.writeFileSync(markdownFilePath, '# Spec\n');

  const sourcePath = path.join(data, 'release.csv');
  const rows = [
    [...DRIFT_HEADERS],
    ['c1', 'item-1', 'name-1', 'yes', 'allow', 'alice'],
    ['c2', 'item-2', 'name-2', 'no', 'hold', 'bob'],
    ['c3', 'item-3', 'name-3', 'yes', 'allow', 'carol'],
  ];
  fs.writeFileSync(
    sourcePath,
    rows.map((row) => row.join(',')).join('\n') + '\n',
  );

  const baseSnapshot = snapshot(BASE_HEADERS);
  const observationSnapshot = snapshot(DRIFT_HEADERS);

  const rawPrototype = createWorksheetFormatPrototype(
    'release-table',
    baseSnapshot,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Deterministic proposal review workflow fixture',
      prototype: rawPrototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline-release-table',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );

  const match = matchWorksheetFormatSnapshot(
    observationSnapshot,
    [
      formatProfileToWorksheetPrototype(
        profile,
        SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
      ),
    ],
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );

  const observationResult = createContainedCognitiveObservation(
    {
      id: 'worksheet-format-observation',
      kind: 'worksheet-format',
      schemaVersion: 'worksheet-format-observation-v1',
      sourceKind: 'csv',
      markdownFilePath,
      sourcePath: '../data/release.csv',
      workspaceRoot: root,
      featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
      sourceProfileId: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE.id,
    },
    () => ({ kind: 'worksheet-format' }),
  );

  const judgment = adaptClosedChoiceResponse(
    observationResult.observation,
    {
      id: 'mmi.local.closed-choice-test',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice'],
    },
    {
      id: 'review-attention',
      semantics: 'Whether the reviewer should inspect the proposal carefully.',
      choices: ['inspect', 'routine'] as const,
    },
    {
      status: 'decision',
      choice: 'inspect',
      probability: 0.8,
      confidence: 0.7,
      distribution: {
        inspect: 0.8,
        routine: 0.2,
      },
    },
  );

  const envelope = createCognitiveReviewEnvelope({
    perception: adaptWorksheetFormatMatchToCognitiveOutcome(
      observationResult.observation,
      match,
    ),
    approvedProfiles: [profile],
    sourceProfile: SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
    judgment,
  });

  const workbook: WorkbookData = {
    sheets: {
      Sheet1: rows,
    },
  };

  const input = {
    envelope,
    rawNotation: TABLE,
    markdownFilePath,
    workspaceRoot: root,
    issuer: {
      kind: 'authority-plane' as const,
      componentId: 'mmi.experimental.proposal-deterministic-review-test',
      componentVersion: '1',
      runId: 'run-proposal-deterministic-review',
    },
    deterministicReview: {
      observationSnapshot,
      prototypeSnapshots: [{
        id: 'release-table',
        snapshot: baseSnapshot,
      }],
    },
  };

  return {
    root,
    sourcePath,
    workbook,
    envelope,
    input,
    baseSnapshot,
    observationSnapshot,
  };
}

test('composes proposal, Authority, Cognitive review, Judgment, provenance, and deterministic reason as distinct siblings', () => {
  const f = fixture();
  const surface = prepareExecutableProposalDeterministicReviewWithLoader(
    f.input,
    () => f.workbook,
  );

  assert.equal(
    surface.schemaVersion,
    EXECUTABLE_PROPOSAL_DETERMINISTIC_REVIEW_SURFACE_SCHEMA_VERSION,
  );
  assert.equal(surface.audience, 'human-review');

  assert.equal(surface.proposal.role, 'executable-proposal-identity');
  assert.match(surface.proposal.digest, /^sha256:[0-9a-f]{64}$/u);

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'satisfied',
  );
  assert.equal(surface.review.authority.disposition, 'review-only');
  assert.equal(surface.review.authority.writeAuthority, 'none');
  assert.equal(surface.review.authority.applyStatus, 'not-authorized');

  assert.equal(surface.review.perception.classification, 'matched');
  assert.equal(
    surface.review.perception.winnerPrototypeId,
    'release-table',
  );

  assert.equal(surface.review.judgment.state, 'proposal');
  if (surface.review.judgment.state === 'proposal') {
    assert.equal(surface.review.judgment.choice, 'inspect');
    assert.equal(surface.review.judgment.disposition, 'proposal-only');
  }

  assert.equal(surface.review.provenance.role, 'provenance');
  assert.equal(
    surface.review.provenance.sourceDigest,
    f.envelope.sourceDigest,
  );

  assert.deepEqual(
    surface.deterministicReviewEvidence.reasons,
    [{
      code: 'fill-supported-acceptance',
      category: 'decision-impact',
      reviewRole: 'review-relevant',
    }],
  );
  assert.equal(
    surface.deterministicReviewEvidence.sourceDigest,
    f.envelope.sourceDigest,
  );
  assert.equal(
    surface.deterministicReviewEvidence.comparison.control.status,
    'novel',
  );
  assert.equal(
    surface.deterministicReviewEvidence.comparison.primary.status,
    'matched',
  );
});

test('Authority can be blocked while deterministic and Cognitive evidence remain descriptive and unchanged', () => {
  const f = fixture();
  const surface = prepareExecutableProposalDeterministicReviewWithLoader(
    {
      ...f.input,
      rawNotation:
        '![[../data/release.csv#Sheet1|A1:F4?mode=rocket]]',
    },
    () => f.workbook,
  );

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'blocked',
  );
  assert.ok(
    surface.authorityVerification.failedChecks.includes('parameter-schema'),
  );
  assert.equal(surface.review.perception.classification, 'matched');
  assert.deepEqual(
    surface.deterministicReviewEvidence.reasons.map((reason) => reason.code),
    ['fill-supported-acceptance'],
  );
  assert.equal(surface.review.authority.applyStatus, 'not-authorized');
});

test('rejects a deterministic prototype pool that does not match visible Envelope profiles before loader invocation', () => {
  const f = fixture();
  let loaderCalls = 0;

  assert.throws(
    () => prepareExecutableProposalDeterministicReviewWithLoader(
      {
        ...f.input,
        deterministicReview: {
          ...f.input.deterministicReview,
          prototypeSnapshots: [{
            id: 'other-profile',
            snapshot: f.baseSnapshot,
          }],
        },
      },
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /prototype pool does not match/,
  );
  assert.equal(loaderCalls, 0);
});

test('rejects a deterministic observation whose recomputed matcher result does not match Perception before loader invocation', () => {
  const f = fixture();
  let loaderCalls = 0;

  assert.throws(
    () => prepareExecutableProposalDeterministicReviewWithLoader(
      {
        ...f.input,
        deterministicReview: {
          ...f.input.deterministicReview,
          observationSnapshot: f.baseSnapshot,
        },
      },
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /does not match Perception/,
  );
  assert.equal(loaderCalls, 0);
});

test('does not mutate the Envelope or deterministic snapshots', () => {
  const f = fixture();
  const envelopeBefore = structuredClone(f.envelope);
  const observationBefore = structuredClone(f.observationSnapshot);
  const prototypeBefore = structuredClone(f.baseSnapshot);

  prepareExecutableProposalDeterministicReviewWithLoader(
    f.input,
    () => f.workbook,
  );

  assert.deepEqual(f.envelope, envelopeBefore);
  assert.deepEqual(f.observationSnapshot, observationBefore);
  assert.deepEqual(f.baseSnapshot, prototypeBefore);
});

test('serialized UI-neutral surface excludes raw proposal, worksheet snapshots, evaluation labels, and apply semantics', () => {
  const f = fixture();
  const surface = prepareExecutableProposalDeterministicReviewWithLoader(
    f.input,
    () => f.workbook,
  );
  const serialized = JSON.stringify(surface);

  assert.equal(serialized.includes(TABLE), false);
  assert.equal(serialized.includes('../data/release.csv'), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('expectedReview'), false);
  assert.equal(serialized.includes('"apply":'), false);
  assert.equal(serialized.includes('auto-apply'), false);
  assert.equal(serialized.includes('accepted'), false);

  assert.equal(
    serialized.includes('fill-supported-acceptance'),
    true,
  );
  assert.equal(serialized.includes(surface.proposal.digest), true);
});

test('default-loader composition preserves deterministic evidence in a normal dependency environment', async () => {
  const f = fixture();
  const surface =
    await prepareExecutableProposalDeterministicReviewWithDefaultLoader(
      f.input,
    );

  assert.equal(
    surface.authorityVerification.verificationStatus,
    'satisfied',
  );
  assert.deepEqual(
    surface.deterministicReviewEvidence.reasons.map((reason) => reason.code),
    ['fill-supported-acceptance'],
  );
});
