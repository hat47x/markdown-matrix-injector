import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_REPRESENTATION,
  type WorksheetReviewRouteEvaluationRecordComparisonV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparison.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION,
  type WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
  type WorksheetReviewRouteEvaluationRecordPlannedComparisonResultV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPlan.js';
import {
  createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonExecutionRecord.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_JSON_CODEC_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_MEDIA_TYPE,
  createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordFileName,
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson,
  parseWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson,
  prepareWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifact,
  serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonCodec.js';

const leftRecordDigest =
  `sha256:${'a'.repeat(64)}`;
const rightRecordDigest =
  `sha256:${'b'.repeat(64)}`;

function policy(): WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
    purpose: 'explicit-comparison-change-policy',
    allowedChanges: {
      recordIdentity: true,
      planDigest: false,
      packetDigest: false,
      readinessPolicy: false,
      planProvider: false,
      response: false,
      groundTruth: true,
      summary: true,
      projectionSeparability: true,
      reportProvider: false,
    },
    labelOnlyReevaluation: 'required',
  };
}

function plan(): WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
  const p = policy();
  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION,
    leftRecordDigest,
    rightRecordDigest,
    [
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
      'explicit-comparison-change-policy',
      [
        p.allowedChanges.recordIdentity,
        p.allowedChanges.planDigest,
        p.allowedChanges.packetDigest,
        p.allowedChanges.readinessPolicy,
        p.allowedChanges.planProvider,
        p.allowedChanges.response,
        p.allowedChanges.groundTruth,
        p.allowedChanges.summary,
        p.allowedChanges.projectionSeparability,
        p.allowedChanges.reportProvider,
      ],
      p.labelOnlyReevaluation,
    ],
  ]);

  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION,
    purpose: 'predeclared-evaluation-record-comparison',
    leftRecordDigest,
    rightRecordDigest,
    policy: p,
    planDigest:
      `sha256:${createHash('sha256')
        .update(canonical, 'utf8')
        .digest('hex')}`,
  };
}

function comparison(): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_SCHEMA_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_REPRESENTATION,
    purpose: 'evaluation-record-comparison',
    leftRecordDigest,
    rightRecordDigest,
    recordIdentity: {
      sameRecord: false,
    },
    plan: {
      samePlanDigest: true,
      samePacketDigest: true,
      sameReadinessPolicy: true,
      sameProvider: true,
    },
    response: {
      sameResponse: true,
      changedCaseIds: [],
    },
    groundTruth: {
      sameGroundTruthDigest: false,
      changedExpectedRouteCaseIds: ['case-a'],
      labelOnlyReevaluation: true,
    },
    report: {
      sameSummary: false,
      sameProjectionSeparability: false,
      sameProvider: true,
    },
  };
}

function completed(
  p = plan(),
): WorksheetReviewRouteEvaluationRecordPlannedComparisonResultV1 {
  return {
    status: 'completed',
    planDigest: p.planDigest,
    result:
      evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
        comparison(),
        p.policy,
      ),
  };
}

function record() {
  const p = plan();
  return createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
    p,
    completed(p),
  );
}

test('serializes deterministically as compact canonical JSON and round-trips', () => {
  const source = record();
  const before = structuredClone(source);

  const first =
    serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      source,
    );
  const second =
    serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      source,
    );

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      first,
    ),
    source,
  );
  assert.deepEqual(source, before);
});

test('normalizing parse accepts pretty JSON while canonical parse rejects it', () => {
  const source = record();
  const pretty = JSON.stringify(source, null, 2);

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      pretty,
    ),
    source,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        pretty,
      ),
    /not canonical/,
  );
});

test('canonical parse rejects key-order differences, trailing newline, and duplicate-key text', () => {
  const source = record();
  const noncanonical = JSON.stringify(source);
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      source,
    );

  assert.notEqual(noncanonical, canonical);
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        noncanonical,
      ),
    /not canonical/,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        `${canonical}\n`,
      ),
    /not canonical/,
  );

  const duplicate = canonical.replace(
    '"purpose":"planned-comparison-execution-record"',
    '"purpose":"planned-comparison-execution-record","purpose":"planned-comparison-execution-record"',
  );
  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      duplicate,
    ),
    source,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        duplicate,
      ),
    /not canonical/,
  );
});

test('semantic execution-record tamper is rejected by the issue-0188 validator boundary', () => {
  const invalid = {
    ...record(),
    executionDigest:
      `sha256:${'0'.repeat(64)}`,
  };

  assert.throws(
    () =>
      serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        invalid as never,
      ),
    /digest does not match/,
  );

  assert.throws(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        JSON.stringify(invalid),
      ),
    /digest does not match/,
  );
});

test('prepares a transport-neutral artifact using the full executionDigest hex', () => {
  const source = record();
  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifact(
      source,
    );
  const digestHex =
    source.executionDigest.replace('sha256:', '');

  assert.equal(
    artifact.codecVersion,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_JSON_CODEC_VERSION,
  );
  assert.equal(
    artifact.mediaType,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_MEDIA_TYPE,
  );
  assert.equal(
    artifact.fileName,
    `worksheet-review-route-evaluation-record-comparison-execution-${digestHex}.json`,
  );
  assert.equal(
    artifact.fileName,
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordFileName(
      source,
    ),
  );
  assert.equal(
    artifact.content,
    serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      source,
    ),
  );
});
