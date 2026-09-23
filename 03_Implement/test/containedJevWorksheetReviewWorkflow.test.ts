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
  prepareContainedUnifiedReviewWithJevRouteReaderAndLoader,
} from '../src/experimental/containedJevWorksheetReviewWorkflow.js';
import {
  approveFormatProfile,
  createFormatProfileCandidate,
} from '../src/experimental/formatProfile.js';
import type {
  JevSystemOneChoiceRequest,
} from '../src/experimental/jevChoiceJudgmentProvider.js';
import type {
  WorksheetFormatSnapshot,
} from '../src/experimental/worksheetFormatFeatureAdapter.js';
import {
  createWorksheetFormatPrototype,
  SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
} from '../src/experimental/worksheetFormatPrototype.js';

function snapshot(): WorksheetFormatSnapshot {
  return {
    cells: [
      { row: 0, column: 0, text: 'Table' },
      { row: 1, column: 0, text: 'ID', fillTone: 'dark' },
      { row: 1, column: 1, text: 'State', fillTone: 'dark' },
      { row: 2, column: 0, text: '1' },
      { row: 2, column: 1, text: 'ready' },
    ],
    merges: [{
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    }],
  };
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-contained-jev-route-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'source.xlsx');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, Buffer.from('stable-source'));

  const prototype = createWorksheetFormatPrototype(
    'release-table',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  const profile = approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Contained Jev route fixture',
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );

  const workbook: WorkbookData = {
    sheets: {
      Sheet1: sheetSourceFromMatrix([
        ['ID', 'State'],
        ['1', 'ready'],
      ]),
    },
  };

  return {
    root,
    sourcePath,
    workbook,
    input: {
      observationId: 'source-observation',
      sourceKind: 'xlsx',
      markdownFilePath,
      sourcePath: '../data/source.xlsx',
      workspaceRoot: root,
      approvedProfiles: [profile],
      rawNotation:
        '![[../data/source.xlsx#Sheet1|A1:B2?header=first&mode=table]]',
      issuer: {
        kind: 'authority-plane' as const,
        componentId: 'mmi.experimental.contained-jev-route-test',
        componentVersion: '1',
        runId: 'run-contained-jev-route',
      },
      allowExternalJev: true as const,
    },
  };
}

function response(choice: 'inspect' | 'routine') {
  return {
    model: 'jev-latest',
    answers: {
      decision: {
        type: 'choice',
        choice,
        probabilities: choice === 'inspect'
          ? { inspect: 0.8, routine: 0.2 }
          : { inspect: 0.2, routine: 0.8 },
        confidence: 0.7,
      },
    },
  };
}

test('runs the fixed Jev route contract through contained unified review', async () => {
  const f = fixture();
  let seen: JevSystemOneChoiceRequest | undefined;

  const model =
    await prepareContainedUnifiedReviewWithJevRouteReaderAndLoader(
      f.input,
      {
        async evaluate(request) {
          seen = structuredClone(request);
          return response('routine');
        },
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: snapshot(),
      }),
      () => f.workbook,
    );

  assert.ok(seen);
  assert.deepEqual(seen.state, {
    classification: 'matched',
    candidateCount: 1,
    hasWinner: true,
    noveltyScore: 0,
  });
  assert.deepEqual(
    Object.keys(seen.questions.decision.criteria),
    ['inspect', 'routine'],
  );

  assert.equal(model.cognitive.judgment.state, 'proposal');
  if (model.cognitive.judgment.state === 'proposal') {
    assert.equal(model.cognitive.judgment.choice, 'routine');
    assert.equal(model.cognitive.judgment.disposition, 'proposal-only');
  }
  assert.equal(model.authority.boundary.applyStatus, 'not-authorized');
  assert.equal(model.authority.boundary.writeAuthority, 'none');
});

test('rejects missing external Jev consent before any I/O', async () => {
  const f = fixture();
  let snapshotReads = 0;
  let transportCalls = 0;
  let workbookLoads = 0;

  await assert.rejects(
    () => prepareContainedUnifiedReviewWithJevRouteReaderAndLoader(
      {
        ...f.input,
        allowExternalJev: false,
      } as never,
      {
        async evaluate() {
          transportCalls += 1;
          return response('inspect');
        },
      },
      () => {
        snapshotReads += 1;
        return {
          sheetName: 'Sheet1',
          snapshot: snapshot(),
        };
      },
      () => {
        workbookLoads += 1;
        return f.workbook;
      },
    ),
    /allowExternalJev=true/,
  );

  assert.equal(snapshotReads, 0);
  assert.equal(transportCalls, 0);
  assert.equal(workbookLoads, 0);
});

test('propagates pinned model and provider provenance', async () => {
  const f = fixture();
  let modelId = '';

  const model =
    await prepareContainedUnifiedReviewWithJevRouteReaderAndLoader(
      {
        ...f.input,
        jevModel: 'jev-1.13.0',
        jevProviderId: 'mmi.typesafe.jev.review-route',
      },
      {
        async evaluate(request) {
          modelId = request.model;
          return {
            ...response('inspect'),
            model: 'jev-1.13.0',
          };
        },
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: snapshot(),
      }),
      () => f.workbook,
    );

  assert.equal(modelId, 'jev-1.13.0');
  assert.equal(model.cognitive.judgment.state, 'proposal');
  if (model.cognitive.judgment.state === 'proposal') {
    assert.equal(
      model.cognitive.judgment.provider.id,
      'mmi.typesafe.jev.review-route',
    );
    assert.equal(
      model.cognitive.judgment.provider.version,
      'jev-1.13.0',
    );
  }
});

test('transport failure stops before Authority Workbook loading', async () => {
  const f = fixture();
  let loads = 0;

  await assert.rejects(
    () => prepareContainedUnifiedReviewWithJevRouteReaderAndLoader(
      f.input,
      {
        async evaluate() {
          throw new Error('transport failed');
        },
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: snapshot(),
      }),
      () => {
        loads += 1;
        return f.workbook;
      },
    ),
    /transport failed/,
  );

  assert.equal(loads, 0);
});

test('final model does not retain Jev state or source transient data', async () => {
  const f = fixture();

  const model =
    await prepareContainedUnifiedReviewWithJevRouteReaderAndLoader(
      f.input,
      {
        async evaluate() {
          return response('inspect');
        },
      },
      () => ({
        sheetName: 'Secret Sheet',
        snapshot: snapshot(),
      }),
      () => f.workbook,
    );

  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes('Secret Sheet'), false);
  assert.equal(serialized.includes('"candidateCount"'), false);
  assert.equal(serialized.includes('"hasWinner"'), false);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes(f.sourcePath), false);
  assert.equal(serialized.includes(f.input.rawNotation), false);
});
