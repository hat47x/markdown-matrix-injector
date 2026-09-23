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
  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord,
  createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonExecutionRecord.js';

const leftRecordDigest =
  `sha256:${'a'.repeat(64)}`;
const rightRecordDigest =
  `sha256:${'b'.repeat(64)}`;

function policy(
  allowLabelOnly: boolean,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
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
      groundTruth: allowLabelOnly,
      summary: allowLabelOnly,
      projectionSeparability: allowLabelOnly,
      reportProvider: false,
    },
    labelOnlyReevaluation:
      allowLabelOnly ? 'required' : 'forbidden',
  };
}

function plan(
  p = policy(true),
): WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
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
    policy: structuredClone(p),
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

test('creates a deterministic linked execution record for a compliant result', () => {
  const p = plan();
  const done = completed(p);

  const first =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      done,
    );
  const second =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      done,
    );

  assert.doesNotThrow(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
        first,
      ),
  );
  assert.equal(first.planDigest, p.planDigest);
  assert.equal(
    first.leftRecordDigest,
    leftRecordDigest,
  );
  assert.equal(
    first.rightRecordDigest,
    rightRecordDigest,
  );
  assert.equal(first.result.compliant, true);
  assert.equal(
    first.executionDigest,
    second.executionDigest,
  );
  assert.match(
    first.executionDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test('strict validation rejects unknown fields and executionDigest tamper', () => {
  const p = plan();
  const record =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      completed(p),
    );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord({
        ...record,
        trusted: true,
      }),
    /Unknown worksheet review-route comparison execution record field/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord({
        ...record,
        executionDigest:
          `sha256:${'0'.repeat(64)}`,
      }),
    /digest does not match/,
  );
});

test('creation rejects a completed result carrying another planDigest', () => {
  const p = plan();
  const done = completed(p);

  assert.throws(
    () =>
      createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
        p,
        {
          ...done,
          planDigest:
            `sha256:${'f'.repeat(64)}`,
        },
      ),
    /does not match the predeclared plan/,
  );
});

test('validation rejects a valid policy result for another directional record pair', () => {
  const p = plan();
  const record =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      completed(p),
    );

  const swappedComparison = {
    ...comparison(),
    leftRecordDigest: rightRecordDigest,
    rightRecordDigest: leftRecordDigest,
  };
  const mismatchedResult =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      swappedComparison,
      p.policy,
    );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord({
        ...record,
        result: mismatchedResult,
      }),
    /result pair does not match/,
  );
});

test('validation rejects a semantically valid result evaluated under another policy', () => {
  const p = plan();
  const record =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      completed(p),
    );
  const otherPolicy = policy(false);
  const otherResult =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      comparison(),
      otherPolicy,
    );

  assert.equal(otherResult.compliant, false);

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord({
        ...record,
        result: otherResult,
      }),
    /result policy does not match/,
  );
});

test('noncompliant planned comparison is still a valid execution record', () => {
  const p = plan(policy(false));
  const done = completed(p);

  assert.equal(done.result.compliant, false);
  assert.equal(
    done.result.violations.some(
      (entry) =>
        entry.code === 'GROUND_TRUTH_CHANGED',
    ),
    true,
  );

  const record =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      done,
    );

  assert.equal(record.result.compliant, false);
  assert.doesNotThrow(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
        record,
      ),
  );
});

test('creation and validation do not mutate plan or result inputs', () => {
  const p = plan();
  const done = completed(p);
  const beforePlan = structuredClone(p);
  const beforeDone = structuredClone(done);

  const record =
    createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
      p,
      done,
    );
  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
    record,
  );

  assert.deepEqual(p, beforePlan);
  assert.deepEqual(done, beforeDone);
});
