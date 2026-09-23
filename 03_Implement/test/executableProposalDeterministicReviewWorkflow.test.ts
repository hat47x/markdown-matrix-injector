import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  WorkbookData,
} from '../src/core/workbookLoader.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
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
  UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
} from '../src/experimental/unifiedHumanReviewViewModel.js';
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
      Sheet1: sheetSourceFromMatrix(rows),
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
      approvedProfiles: [profile],
    },
  };

  return {
    root,
    sourcePath,
    workbook,
    envelope,
    input,
    profile,
    observationSnapshot,
  };
}

test('returns the unified four-domain review model from one safe orchestration entrypoint', () => {
  const f = fixture();
  const model = prepareExecutableProposalDeterministicReviewWithLoader(
    f.input,
    () => f.workbook,
  );

  assert.equal(
    model.schemaVersion,
    UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  );
  assert.equal(model.audience, 'human-review');

  assert.equal(model.proposalIdentity.role, 'proposal-identity');
  assert.match(model.proposalIdentity.digest, /^sha256:[0-9a-f]{64}$/u);

  assert.equal(
    model.authority.verification.verificationStatus,
    'satisfied',
  );
  assert.equal(model.authority.boundary.disposition, 'review-only');
  assert.equal(model.authority.boundary.writeAuthority, 'none');
  assert.equal(model.authority.boundary.applyStatus, 'not-authorized');

  assert.equal(model.cognitive.perception.classification, 'matched');
  assert.equal(
    model.cognitive.perception.winnerPrototypeId,
    'release-table',
  );

  assert.equal(model.cognitive.judgment.state, 'proposal');
  if (model.cognitive.judgment.state === 'proposal') {
    assert.equal(model.cognitive.judgment.choice, 'inspect');
    assert.equal(model.cognitive.judgment.disposition, 'proposal-only');
  }

  assert.equal(model.cognitive.provenance.role, 'provenance');
  assert.equal(
    model.cognitive.provenance.sourceDigest,
    f.envelope.sourceDigest,
  );

  assert.deepEqual(
    model.deterministic.evidence.reasons,
    [{
      code: 'fill-supported-acceptance',
      category: 'decision-impact',
      reviewRole: 'review-relevant',
    }],
  );
  assert.equal(
    model.deterministic.evidence.sourceDigest,
    f.envelope.sourceDigest,
  );
  assert.equal(
    model.deterministic.evidence.comparison.control.status,
    'novel',
  );
  assert.equal(
    model.deterministic.evidence.comparison.primary.status,
    'matched',
  );

  assert.equal('overallStatus' in model, false);
  assert.equal('overallScore' in model, false);
  assert.equal('approved' in model, false);
});

test('Authority can be blocked while deterministic and Cognitive sections remain descriptive and unchanged', () => {
  const f = fixture();
  const model = prepareExecutableProposalDeterministicReviewWithLoader(
    {
      ...f.input,
      rawNotation:
        '![[../data/release.csv#Sheet1|A1:F4?mode=rocket]]',
    },
    () => f.workbook,
  );

  assert.equal(
    model.authority.verification.verificationStatus,
    'blocked',
  );
  assert.ok(
    model.authority.verification.failedChecks.includes('parameter-schema'),
  );
  assert.equal(model.cognitive.perception.classification, 'matched');
  assert.deepEqual(
    model.deterministic.evidence.reasons.map((reason) => reason.code),
    ['fill-supported-acceptance'],
  );
  assert.equal(model.authority.boundary.applyStatus, 'not-authorized');
});

test('rejects an approved Profile pool that does not match visible Envelope refs before loader invocation', () => {
  const f = fixture();
  let loaderCalls = 0;
  const otherProfile = {
    ...f.profile,
    id: 'other-profile',
  };

  assert.throws(
    () => prepareExecutableProposalDeterministicReviewWithLoader(
      {
        ...f.input,
        deterministicReview: {
          ...f.input.deterministicReview,
          approvedProfiles: [otherProfile],
        },
      },
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /approved Profile does not match Envelope ref/,
  );
  assert.equal(loaderCalls, 0);
});

test('rejects an approved Profile whose provenance no longer matches the Envelope ref before loader invocation', () => {
  const f = fixture();
  let loaderCalls = 0;
  const changedProfile = {
    ...f.profile,
    provenance: {
      ...f.profile.provenance,
      sourceDigest: 'sha256:changed-baseline',
    },
  };

  assert.throws(
    () => prepareExecutableProposalDeterministicReviewWithLoader(
      {
        ...f.input,
        deterministicReview: {
          ...f.input.deterministicReview,
          approvedProfiles: [changedProfile],
        },
      },
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /approved Profile does not match Envelope ref/,
  );
  assert.equal(loaderCalls, 0);
});

test('rejects an observation whose derived format identity does not match Perception before loader invocation', () => {
  const f = fixture();
  let loaderCalls = 0;

  assert.throws(
    () => prepareExecutableProposalDeterministicReviewWithLoader(
      {
        ...f.input,
        deterministicReview: {
          ...f.input.deterministicReview,
          observationSnapshot: snapshot(BASE_HEADERS),
        },
      },
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /observation identity does not match/,
  );
  assert.equal(loaderCalls, 0);
});

test('rejects a tampered Perception observation identity before loader invocation', () => {
  const f = fixture();
  let loaderCalls = 0;
  const currentIdentity =
    f.envelope.perception.signal.payload.observationIdentity;

  const tamperedEnvelope = {
    ...f.envelope,
    perception: {
      ...f.envelope.perception,
      signal: {
        ...f.envelope.perception.signal,
        payload: {
          ...f.envelope.perception.signal.payload,
          observationIdentity: {
            ...currentIdentity,
            digest: `sha256:${'0'.repeat(64)}`,
          },
        },
      },
    },
  };

  assert.throws(
    () => prepareExecutableProposalDeterministicReviewWithLoader(
      {
        ...f.input,
        envelope: tamperedEnvelope,
      },
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /observation identity does not match/,
  );
  assert.equal(loaderCalls, 0);
});

test('does not mutate the Envelope, approved Profile, or observation snapshot', () => {
  const f = fixture();
  const envelopeBefore = structuredClone(f.envelope);
  const profileBefore = structuredClone(f.profile);
  const observationBefore = structuredClone(f.observationSnapshot);

  prepareExecutableProposalDeterministicReviewWithLoader(
    f.input,
    () => f.workbook,
  );

  assert.deepEqual(f.envelope, envelopeBefore);
  assert.deepEqual(f.profile, profileBefore);
  assert.deepEqual(f.observationSnapshot, observationBefore);
});

test('serialized unified model excludes raw proposal, worksheet snapshot, evaluation labels, and apply semantics', () => {
  const f = fixture();
  const model = prepareExecutableProposalDeterministicReviewWithLoader(
    f.input,
    () => f.workbook,
  );
  const serialized = JSON.stringify(model);

  assert.equal(serialized.includes(TABLE), false);
  assert.equal(serialized.includes('../data/release.csv'), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('expectedReview'), false);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('combinedScore'), false);
  assert.equal(serialized.includes('"apply":'), false);
  assert.equal(serialized.includes('auto-apply'), false);
  assert.equal(serialized.includes('"accepted"'), false);
  assert.equal(serialized.includes('"approved"'), false);

  assert.equal(
    serialized.includes('fill-supported-acceptance'),
    true,
  );
  assert.equal(serialized.includes(model.proposalIdentity.digest), true);
});

test('default-loader orchestration returns the same unified review contract in a normal dependency environment', async () => {
  const f = fixture();
  const model =
    await prepareExecutableProposalDeterministicReviewWithDefaultLoader(
      f.input,
    );

  assert.equal(
    model.schemaVersion,
    UNIFIED_HUMAN_REVIEW_VIEW_MODEL_SCHEMA_VERSION,
  );
  assert.equal(
    model.authority.verification.verificationStatus,
    'satisfied',
  );
  assert.deepEqual(
    model.deterministic.evidence.reasons.map((reason) => reason.code),
    ['fill-supported-acceptance'],
  );
});
