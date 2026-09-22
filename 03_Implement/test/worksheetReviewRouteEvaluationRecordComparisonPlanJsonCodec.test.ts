import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION,
  type WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPlan.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_JSON_CODEC_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_MEDIA_TYPE,
  createWorksheetReviewRouteEvaluationRecordComparisonPlanFileName,
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson,
  parseWorksheetReviewRouteEvaluationRecordComparisonPlanJson,
  prepareWorksheetReviewRouteEvaluationRecordComparisonPlanJsonArtifact,
  serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPlanJsonCodec.js';

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
  const leftRecordDigest =
    `sha256:${'a'.repeat(64)}`;
  const rightRecordDigest =
    `sha256:${'b'.repeat(64)}`;
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

test('serializes deterministically as compact canonical JSON and round-trips', () => {
  const source = plan();
  const before = structuredClone(source);

  const first =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      source,
    );
  const second =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      source,
    );

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      first,
    ),
    source,
  );
  assert.deepEqual(source, before);
});

test('normalizing parse accepts pretty JSON while canonical parse rejects it', () => {
  const pretty = JSON.stringify(plan(), null, 2);

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      pretty,
    ),
    plan(),
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
        pretty,
      ),
    /not canonical/,
  );
});

test('canonical parse rejects noncanonical key order and trailing newline', () => {
  const source = plan();
  const noncanonical = JSON.stringify(source);
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      source,
    );

  assert.notEqual(noncanonical, canonical);
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
        noncanonical,
      ),
    /not canonical/,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
        `${canonical}\n`,
      ),
    /not canonical/,
  );
});

test('canonical parse rejects duplicate-key JSON text', () => {
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      plan(),
    );
  const duplicate = canonical.replace(
    '"purpose":"predeclared-evaluation-record-comparison"',
    '"purpose":"predeclared-evaluation-record-comparison","purpose":"predeclared-evaluation-record-comparison"',
  );

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      duplicate,
    ),
    plan(),
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
        duplicate,
      ),
    /not canonical/,
  );
});

test('semantic plan tamper is rejected by the issue-0186 validator boundary', () => {
  const invalid = {
    ...plan(),
    planDigest:
      `sha256:${'0'.repeat(64)}`,
  };

  assert.throws(
    () =>
      serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
        invalid as never,
      ),
    /digest does not match/,
  );

  assert.throws(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
        JSON.stringify(invalid),
      ),
    /digest does not match/,
  );
});

test('prepares a transport-neutral artifact using the full planDigest hex', () => {
  const source = plan();
  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordComparisonPlanJsonArtifact(
      source,
    );
  const digestHex =
    source.planDigest.replace('sha256:', '');

  assert.equal(
    artifact.codecVersion,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_JSON_CODEC_VERSION,
  );
  assert.equal(
    artifact.mediaType,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_MEDIA_TYPE,
  );
  assert.equal(
    artifact.fileName,
    `worksheet-review-route-evaluation-record-comparison-plan-${digestHex}.json`,
  );
  assert.equal(
    artifact.fileName,
    createWorksheetReviewRouteEvaluationRecordComparisonPlanFileName(
      source,
    ),
  );
  assert.equal(
    artifact.content,
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
      source,
    ),
  );
});
