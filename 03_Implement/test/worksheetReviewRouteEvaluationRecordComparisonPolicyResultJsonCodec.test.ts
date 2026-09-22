import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  WorksheetReviewRouteEvaluationRecordComparisonV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparison.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_JSON_CODEC_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_MEDIA_TYPE,
  createWorksheetReviewRouteEvaluationRecordComparisonPolicyResultFileName,
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson,
  parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson,
  prepareWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJsonArtifact,
  serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicyResultJsonCodec.js';

function comparison(
  leftDigest = `sha256:${'a'.repeat(64)}`,
  rightDigest = `sha256:${'b'.repeat(64)}`,
): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  return {
    schemaVersion:
      'mmi-worksheet-review-route-evaluation-record-comparison-v1',
    representation:
      'worksheet-review-route-evaluation-record-comparison-v1',
    purpose: 'evaluation-record-comparison',
    leftRecordDigest: leftDigest,
    rightRecordDigest: rightDigest,
    recordIdentity: {
      sameRecord: leftDigest === rightDigest,
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

function policy():
  WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
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

function result(
  leftDigest = `sha256:${'a'.repeat(64)}`,
  rightDigest = `sha256:${'b'.repeat(64)}`,
) {
  return evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    comparison(leftDigest, rightDigest),
    policy(),
  );
}

test('canonical serializer is deterministic and round-trips through canonical parse', () => {
  const value = result();

  const first =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      value,
    );
  const second =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      structuredClone(value),
    );

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.equal(first.includes('  '), false);

  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      first,
    ),
    value,
  );
});

test('normalizing parse accepts formatting differences while canonical parse rejects them', () => {
  const value = result();
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      value,
    );
  const pretty = JSON.stringify(value, null, 2);

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      pretty,
    ),
    value,
  );

  for (const nonCanonical of [
    pretty,
    canonical + '\n',
  ]) {
    assert.throws(
      () =>
        parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
          nonCanonical,
        ),
      /valid but not canonical/,
    );
  }

  const reordered =
    JSON.stringify({
      ...value,
      schemaVersion: undefined,
    }).replace(
      /^\{/u,
      `{"schemaVersion":"${value.schemaVersion}",`,
    );

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      reordered,
    ),
    value,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
        reordered,
      ),
    /valid but not canonical/,
  );
});

test('canonical parse rejects duplicate-key input and semantic tamper', () => {
  const value = result();
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      value,
    );

  const duplicate =
    canonical.replace(
      /^\{/u,
      `{"purpose":"comparison-change-policy-result",`,
    );
  assert.doesNotThrow(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
        duplicate,
      ),
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
        duplicate,
      ),
    /valid but not canonical/,
  );

  const tampered = {
    ...value,
    compliant: false,
  };
  assert.throws(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
        JSON.stringify(tampered),
      ),
    /compliant invariant/,
  );
});

test('stable filename preserves left-to-right record comparison direction with full digests', () => {
  const forward = result(
    `sha256:${'1'.repeat(64)}`,
    `sha256:${'2'.repeat(64)}`,
  );
  const reverse = result(
    `sha256:${'2'.repeat(64)}`,
    `sha256:${'1'.repeat(64)}`,
  );

  assert.equal(
    createWorksheetReviewRouteEvaluationRecordComparisonPolicyResultFileName(
      forward,
    ),
    `worksheet-review-route-evaluation-record-comparison-policy-result-${'1'.repeat(64)}-to-${'2'.repeat(64)}.json`,
  );
  assert.equal(
    createWorksheetReviewRouteEvaluationRecordComparisonPolicyResultFileName(
      reverse,
    ),
    `worksheet-review-route-evaluation-record-comparison-policy-result-${'2'.repeat(64)}-to-${'1'.repeat(64)}.json`,
  );
});

test('artifact descriptor is transport-neutral and contains canonical content', () => {
  const value = result();
  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJsonArtifact(
      value,
    );

  assert.equal(
    artifact.codecVersion,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_JSON_CODEC_VERSION,
  );
  assert.equal(
    artifact.mediaType,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_MEDIA_TYPE,
  );
  assert.equal(
    artifact.content,
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      value,
    ),
  );
  assert.match(
    artifact.fileName,
    /^worksheet-review-route-evaluation-record-comparison-policy-result-[0-9a-f]{64}-to-[0-9a-f]{64}\.json$/u,
  );
});

test('serializer does not mutate source result and rejects invalid semantics before encoding', () => {
  const value = result();
  const before = structuredClone(value);

  serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
    value,
  );
  assert.deepEqual(value, before);

  const invalid = structuredClone(value);
  invalid.violations = [
    {
      code: 'RESPONSE_CHANGED',
      dimension: 'response',
    },
  ];

  assert.throws(
    () =>
      serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
        invalid,
      ),
    /violations do not match/,
  );
});
