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
  prepareContainedUnifiedReviewWithReaderAndLoader,
} from '../src/experimental/containedUnifiedReviewWorkflow.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
  type FormatProfileV1,
} from '../src/experimental/formatProfile.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from '../src/experimental/worksheetFormatPrototype.js';

const HEADERS = [
  'ID',
  'Item',
  'Type',
  'Required',
  'Decision',
  'Reviewer',
] as const;

function snapshot(
  headers: readonly string[] = HEADERS,
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
  headers.forEach((_, column) => {
    cells.push({
      row: 2,
      column,
      text: `v${column + 1}`,
    });
  });

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

function approvedProfile(
  id = 'release-table',
  baseline = snapshot(),
): FormatProfileV1 {
  const prototype = createWorksheetFormatPrototype(
    id,
    baseline,
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return approveFormatProfile(
    createFormatProfileCandidate({
      id,
      label: 'Release Table',
      purpose: 'Contained unified review fixture',
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: `sha256:baseline-${id}`,
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: `review:${id}`,
    },
  );
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-contained-unified-review-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'source.xlsx');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, Buffer.from('stable-source-bytes'));

  const profile = approvedProfile();
  const observationSnapshot = snapshot();
  const workbook: WorkbookData = {
    sheets: {
      Sheet1: sheetSourceFromMatrix([
        [...HEADERS],
        ['1', 'item', 'type', 'yes', 'allow', 'alice'],
      ]),
    },
  };

  const input = {
    observationId: 'contained-review-observation',
    sourceKind: 'xlsx',
    markdownFilePath,
    sourcePath: '../data/source.xlsx',
    workspaceRoot: root,
    approvedProfiles: [profile],
    rawNotation:
      '![[../data/source.xlsx#Sheet1|A1:F2?header=first&mode=table]]',
    issuer: {
      kind: 'authority-plane' as const,
      componentId: 'mmi.experimental.contained-unified-review-test',
      componentVersion: '1',
      runId: 'run-contained-unified-review',
    },
  };

  return {
    root,
    sourcePath,
    profile,
    observationSnapshot,
    workbook,
    input,
  };
}

test('builds the unified review from one contained snapshot read', () => {
  const f = fixture();
  let snapshotReads = 0;
  let workbookLoads = 0;

  const model = prepareContainedUnifiedReviewWithReaderAndLoader(
    f.input,
    (absolutePath) => {
      snapshotReads += 1;
      assert.equal(absolutePath, f.sourcePath);
      return {
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      };
    },
    (absolutePath) => {
      workbookLoads += 1;
      assert.equal(absolutePath, f.sourcePath);
      return f.workbook;
    },
  );

  assert.equal(snapshotReads, 1);
  assert.equal(workbookLoads, 1);
  assert.equal(
    model.authority.verification.verificationStatus,
    'satisfied',
  );
  assert.equal(model.cognitive.perception.classification, 'matched');
  assert.equal(model.authority.boundary.writeAuthority, 'none');
  assert.equal(model.authority.boundary.applyStatus, 'not-authorized');
});

test('optional Judgment sees derived Observation and Perception, not raw snapshot', () => {
  const f = fixture();
  let factoryKeys: string[] = [];

  const model = prepareContainedUnifiedReviewWithReaderAndLoader(
    {
      ...f.input,
      judgmentFactory: ({ observation, perception }) => {
        factoryKeys = Object.keys({ observation, perception }).sort();
        const serialized = JSON.stringify({ observation, perception });
        assert.equal(serialized.includes('"cells"'), false);
        assert.equal(serialized.includes('"features"'), false);

        return adaptClosedChoiceResponse(
          observation,
          {
            id: 'mmi.local.closed-choice-test',
            version: '1',
            category: 'judgment',
            executionBoundary: 'local',
            capabilities: ['closed-choice'],
          },
          {
            id: 'review-attention',
            semantics: 'Whether this review deserves extra attention.',
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
      },
    },
    () => ({
      sheetName: 'Sheet1',
      snapshot: f.observationSnapshot,
    }),
    () => f.workbook,
  );

  assert.deepEqual(factoryKeys, ['observation', 'perception']);
  assert.equal(model.cognitive.judgment.state, 'proposal');
});

test('rejects an unapproved Profile before snapshot or Workbook I/O', () => {
  const f = fixture();
  const prototype = createWorksheetFormatPrototype(
    'candidate',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const candidate = createFormatProfileCandidate({
    id: 'candidate',
    label: 'Candidate',
    purpose: 'Not approved',
    prototype,
    sourceKind: 'xlsx-baseline',
    sourceDigest: 'sha256:candidate',
  });
  let reads = 0;
  let loads = 0;

  assert.throws(
    () => prepareContainedUnifiedReviewWithReaderAndLoader(
      {
        ...f.input,
        approvedProfiles: [candidate],
      },
      () => {
        reads += 1;
        return {
          sheetName: 'Sheet1',
          snapshot: f.observationSnapshot,
        };
      },
      () => {
        loads += 1;
        return f.workbook;
      },
    ),
    /Only an approved Format Profile/,
  );

  assert.equal(reads, 0);
  assert.equal(loads, 0);
});

test('source mutation during snapshot read stops before Judgment and Authority loader', () => {
  const f = fixture();
  let judgments = 0;
  let loads = 0;

  assert.throws(
    () => prepareContainedUnifiedReviewWithReaderAndLoader(
      {
        ...f.input,
        judgmentFactory: () => {
          judgments += 1;
          throw new Error('must not run');
        },
      },
      (absolutePath) => {
        fs.appendFileSync(absolutePath, 'changed');
        return {
          sheetName: 'Sheet1',
          snapshot: f.observationSnapshot,
        };
      },
      () => {
        loads += 1;
        return f.workbook;
      },
    ),
    /Source changed while creating Cognitive Observation/,
  );

  assert.equal(judgments, 0);
  assert.equal(loads, 0);
});

test('Judgment failure stops before Authority loader', () => {
  const f = fixture();
  let loads = 0;

  assert.throws(
    () => prepareContainedUnifiedReviewWithReaderAndLoader(
      {
        ...f.input,
        judgmentFactory: () => {
          throw new Error('judgment failed');
        },
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => {
        loads += 1;
        return f.workbook;
      },
    ),
    /judgment failed/,
  );

  assert.equal(loads, 0);
});

test('Authority can block an invalid proposal while Cognitive domains remain descriptive', () => {
  const f = fixture();

  const model = prepareContainedUnifiedReviewWithReaderAndLoader(
    {
      ...f.input,
      rawNotation:
        '![[../data/source.xlsx#Sheet1|A1:F2?mode=rocket]]',
    },
    () => ({
      sheetName: 'Sheet1',
      snapshot: f.observationSnapshot,
    }),
    () => f.workbook,
  );

  assert.equal(
    model.authority.verification.verificationStatus,
    'blocked',
  );
  assert.ok(
    model.authority.verification.failedChecks.includes(
      'parameter-schema',
    ),
  );
  assert.equal(model.cognitive.perception.classification, 'matched');
});

test('Authority source identity blocks a proposal that points at a different file', () => {
  const f = fixture();
  const otherPath = path.join(f.root, 'data', 'other.xlsx');
  fs.writeFileSync(otherPath, Buffer.from('other-source'));

  const model = prepareContainedUnifiedReviewWithReaderAndLoader(
    {
      ...f.input,
      rawNotation:
        '![[../data/other.xlsx#Sheet1|A1:F2?mode=table]]',
    },
    () => ({
      sheetName: 'Sheet1',
      snapshot: f.observationSnapshot,
    }),
    () => f.workbook,
  );

  assert.equal(
    model.authority.verification.verificationStatus,
    'blocked',
  );
  assert.ok(
    model.authority.verification.failedChecks.includes(
      'source-identity',
    ),
  );
});

test('does not mutate caller inputs and final serialization excludes transient data', () => {
  const f = fixture();
  const inputBefore = structuredClone(f.input);
  const profileBefore = structuredClone(f.profile);
  const snapshotBefore = structuredClone(f.observationSnapshot);

  const model = prepareContainedUnifiedReviewWithReaderAndLoader(
    f.input,
    () => ({
      sheetName: 'Sheet1',
      snapshot: f.observationSnapshot,
    }),
    () => f.workbook,
  );

  assert.deepEqual(f.input, inputBefore);
  assert.deepEqual(f.profile, profileBefore);
  assert.deepEqual(f.observationSnapshot, snapshotBefore);

  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes(f.input.rawNotation), false);
  assert.equal(serialized.includes(f.sourcePath), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes('observationIdentity'), false);
  assert.equal(
    serialized.includes('worksheet-format-observation-identity'),
    false,
  );
  assert.equal(serialized.includes('"sheets"'), false);
  assert.equal(serialized.includes('expectedReview'), false);
  assert.equal(serialized.includes('overallScore'), false);
  assert.equal(serialized.includes('combinedScore'), false);
  assert.equal(serialized.includes('"apply":'), false);
});
