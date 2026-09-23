import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  WorkbookData,
} from '../src/core/workbookLoader.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';
import type {
  CognitiveObservation,
} from '../src/experimental/cognitiveContract.js';
import type {
  ClosedChoiceJudgmentProvider,
} from '../src/experimental/closedChoiceJudgmentProvider.js';
import {
  prepareContainedUnifiedReviewWithProviderReaderAndLoader,
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

type ReviewRoute = 'inspect' | 'routine';

const HEADERS = [
  'ID',
  'Item',
  'Type',
  'Required',
  'Decision',
  'Reviewer',
] as const;

function snapshot(): WorksheetFormatSnapshot {
  const cells: WorksheetFormatSnapshot['cells'][number][] = [
    { row: 0, column: 0, text: 'Release Table' },
  ];
  HEADERS.forEach((header, column) => {
    cells.push({
      row: 1,
      column,
      text: header,
      fillTone: 'dark',
    });
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
      endColumn: HEADERS.length - 1,
    }],
  };
}

function approvedProfile(): FormatProfileV1 {
  const prototype = createWorksheetFormatPrototype(
    'release-table',
    snapshot(),
    SHEETJS_CE_XLSX_0203_SOURCE_PROFILE,
  );
  return approveFormatProfile(
    createFormatProfileCandidate({
      id: 'release-table',
      label: 'Release Table',
      purpose: 'Provider-backed contained review fixture',
      prototype,
      sourceKind: 'xlsx-baseline',
      sourceDigest: 'sha256:baseline-release-table',
    }),
    {
      approvedBy: 'reviewer-a',
      approvalReference: 'review:release-table',
    },
  );
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-provider-contained-review-'),
  );
  const docs = path.join(root, 'docs');
  const data = path.join(root, 'data');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const markdownFilePath = path.join(docs, 'spec.md');
  const sourcePath = path.join(data, 'source.xlsx');
  fs.writeFileSync(markdownFilePath, '# Spec\n');
  fs.writeFileSync(sourcePath, Buffer.from('stable-source'));

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

  return {
    root,
    sourcePath,
    profile,
    observationSnapshot,
    workbook,
    input: {
      observationId: 'source-observation',
      sourceKind: 'xlsx',
      markdownFilePath,
      sourcePath: '../data/source.xlsx',
      workspaceRoot: root,
      approvedProfiles: [profile],
      rawNotation:
        '![[../data/source.xlsx#Sheet1|A1:F2?header=first&mode=table]]',
      issuer: {
        kind: 'authority-plane' as const,
        componentId: 'mmi.experimental.provider-contained-review-test',
        componentVersion: '1',
        runId: 'run-provider-contained-review',
      },
      judgmentQuestion: {
        id: 'worksheet-review-route-v1',
        semantics: 'Choose the human review route.',
        choices: ['inspect', 'routine'] as const,
      },
    },
  };
}

function localDecisionProvider(
  onRequest?: (observation: CognitiveObservation) => void,
): ClosedChoiceJudgmentProvider<ReviewRoute> {
  return {
    descriptor: {
      id: 'mmi.local.review-route-test',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice'],
    },
    async decide({ observation }) {
      onRequest?.(observation);
      return {
        status: 'decision',
        choice: 'routine',
        probability: 0.8,
        confidence: 0.7,
        distribution: {
          inspect: 0.2,
          routine: 0.8,
        },
      };
    },
  };
}

test('runs provider on derived review-route Observation and returns proposal-only Judgment', async () => {
  const f = fixture();
  let providerObservation:
    | CognitiveObservation
    | undefined;
  let loads = 0;

  const model =
    await prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: localDecisionProvider((observation) => {
          providerObservation = structuredClone(observation);
        }),
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => {
        loads += 1;
        return f.workbook;
      },
    );

  assert.equal(loads, 1);
  assert.ok(providerObservation);
  assert.equal(
    providerObservation.kind,
    'worksheet-format-review-route',
  );
  assert.equal(
    providerObservation.schemaVersion,
    'worksheet-format-review-route-v1',
  );
  assert.deepEqual(providerObservation.payload, {
    kind: 'worksheet-format-review-route',
    sheetName: 'Sheet1',
    classification: 'matched',
    candidateIds: ['release-table'],
    winnerPrototypeId: 'release-table',
    noveltyScore: 0,
  });
  const providerSerialized = JSON.stringify(providerObservation);
  assert.equal(providerSerialized.includes('"cells"'), false);
  assert.equal(providerSerialized.includes('"features"'), false);
  assert.equal(providerSerialized.includes(f.sourcePath), false);

  assert.equal(model.cognitive.judgment.state, 'proposal');
  if (model.cognitive.judgment.state === 'proposal') {
    assert.equal(model.cognitive.judgment.choice, 'routine');
    assert.equal(model.cognitive.judgment.disposition, 'proposal-only');
  }
});

test('preserves provider abstention as a non-decision', async () => {
  const f = fixture();
  const provider: ClosedChoiceJudgmentProvider<ReviewRoute> = {
    descriptor: {
      id: 'mmi.local.review-route-test',
      version: '1',
      category: 'judgment',
      executionBoundary: 'local',
      capabilities: ['closed-choice'],
    },
    async decide() {
      return {
        status: 'abstained',
        reasonCode: 'INSUFFICIENT_REVIEW_CONTEXT',
        confidence: 0.25,
      };
    },
  };

  const model =
    await prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: provider,
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => f.workbook,
    );

  assert.equal(model.cognitive.judgment.state, 'non-decision');
  if (model.cognitive.judgment.state === 'non-decision') {
    assert.equal(model.cognitive.judgment.status, 'abstained');
    assert.equal(
      model.cognitive.judgment.reasonCode,
      'INSUFFICIENT_REVIEW_CONTEXT',
    );
  }
});

test('external provider without opt-in stops before provider and Authority loader', async () => {
  const f = fixture();
  let providerCalls = 0;
  let loaderCalls = 0;
  const provider = localDecisionProvider();
  provider.descriptor = {
    ...provider.descriptor,
    executionBoundary: 'external-opt-in',
  };
  provider.decide = async () => {
    providerCalls += 1;
    return {
      status: 'unsupported',
      reasonCode: 'SHOULD_NOT_RUN',
    };
  };

  await assert.rejects(
    () => prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: provider,
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /explicit opt-in/,
  );

  assert.equal(providerCalls, 0);
  assert.equal(loaderCalls, 0);
});

test('explicit external opt-in allows exactly one provider invocation', async () => {
  const f = fixture();
  let providerCalls = 0;
  const provider = localDecisionProvider();
  provider.descriptor = {
    ...provider.descriptor,
    executionBoundary: 'external-opt-in',
  };
  const baseDecide = provider.decide;
  provider.decide = async (request) => {
    providerCalls += 1;
    return baseDecide(request);
  };

  const model =
    await prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: provider,
        allowExternalJudgment: true,
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => f.workbook,
    );

  assert.equal(providerCalls, 1);
  assert.equal(model.cognitive.judgment.state, 'proposal');
});

test('provider exception stops before Authority loader', async () => {
  const f = fixture();
  let loaderCalls = 0;
  const provider = localDecisionProvider();
  provider.decide = async () => {
    throw new Error('provider failed');
  };

  await assert.rejects(
    () => prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: provider,
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /provider failed/,
  );

  assert.equal(loaderCalls, 0);
});

test('malformed provider response stops before Authority loader', async () => {
  const f = fixture();
  let loaderCalls = 0;
  const provider = localDecisionProvider();
  provider.decide = async () => ({
    status: 'decision',
    choice: 'routine',
    probability: 0.8,
    confidence: 0.7,
    distribution: {
      inspect: 0.8,
      routine: 0.8,
    },
  });

  await assert.rejects(
    () => prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: provider,
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => {
        loaderCalls += 1;
        return f.workbook;
      },
    ),
    /sum to 1/,
  );

  assert.equal(loaderCalls, 0);
});

test('source mutation during provider wait is detected later by Authority source identity', async () => {
  const f = fixture();
  const provider = localDecisionProvider();
  provider.decide = async () => {
    fs.appendFileSync(f.sourcePath, 'changed-after-observation');
    return {
      status: 'decision',
      choice: 'inspect',
      probability: 0.9,
      confidence: 0.8,
      distribution: {
        inspect: 0.9,
        routine: 0.1,
      },
    };
  };

  const model =
    await prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: provider,
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
  assert.equal(model.cognitive.judgment.state, 'proposal');
});

test('provider-backed final model excludes transient provider/source payloads', async () => {
  const f = fixture();
  const model =
    await prepareContainedUnifiedReviewWithProviderReaderAndLoader(
      {
        ...f.input,
        judgmentProvider: localDecisionProvider(),
      },
      () => ({
        sheetName: 'Sheet1',
        snapshot: f.observationSnapshot,
      }),
      () => f.workbook,
    );

  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes('"cells"'), false);
  assert.equal(serialized.includes('"features"'), false);
  assert.equal(serialized.includes(f.sourcePath), false);
  assert.equal(serialized.includes(f.input.rawNotation), false);
  assert.equal(
    serialized.includes('worksheet-format-review-route'),
    false,
  );
  assert.equal(serialized.includes('"apply":'), false);
  assert.equal(serialized.includes('overallScore'), false);
});
