import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareWorksheetReviewRouteEvaluationRecords,
  type WorksheetReviewRouteEvaluationRecordComparisonV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparison.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_JSON_CODEC_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_MEDIA_TYPE,
  createWorksheetReviewRouteEvaluationRecordComparisonFileName,
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson,
  parseWorksheetReviewRouteEvaluationRecordComparisonJson,
  prepareWorksheetReviewRouteEvaluationRecordComparisonJsonArtifact,
  serializeWorksheetReviewRouteEvaluationRecordComparisonJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonJsonCodec.js';
import type {
  WorksheetReviewRouteEvaluationRecordV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecord.js';

function comparison(
  leftDigest =
    `sha256:${'a'.repeat(64)}`,
  rightDigest =
    `sha256:${'b'.repeat(64)}`,
): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  return {
    schemaVersion:
      'mmi-worksheet-review-route-evaluation-record-comparison-v1',
    representation:
      'worksheet-review-route-evaluation-record-comparison-v1',
    purpose:
      'evaluation-record-comparison',
    leftRecordDigest: leftDigest,
    rightRecordDigest: rightDigest,
    recordIdentity: {
      sameRecord: leftDigest === rightDigest,
    },
    plan: {
      samePlanDigest: false,
      samePacketDigest: true,
      sameReadinessPolicy: false,
      sameProvider: true,
    },
    response: {
      sameResponse: true,
      changedCaseIds: [],
    },
    groundTruth: {
      sameGroundTruthDigest: true,
      changedExpectedRouteCaseIds: [],
      labelOnlyReevaluation: false,
    },
    report: {
      sameSummary: true,
      sameProjectionSeparability: true,
      sameProvider: true,
    },
  };
}

test('canonical serializer is deterministic and round-trips through canonical parse', () => {
  const value = comparison();

  const first =
    serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
      value,
    );
  const second =
    serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
      structuredClone(value),
    );

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.equal(first.includes('  '), false);

  const parsed =
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(
      first,
    );
  assert.deepEqual(parsed, value);
});

test('normalizing parse accepts formatting differences while canonical parse rejects them', () => {
  const value = comparison();
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
      value,
    );
  const pretty = JSON.stringify(value, null, 2);

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonJson(
      pretty,
    ),
    value,
  );

  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(
        pretty,
      ),
    /valid but not canonical/,
  );

  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(
        canonical + '\n',
      ),
    /valid but not canonical/,
  );

  const reordered =
    JSON.stringify({
      ...value,
      schemaVersion: undefined,
    }).replace(
      /^\{/u,
      `{"schemaVersion":"${value.schemaVersion}",`,
    );
  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonJson(
      reordered,
    ),
    value,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(
        reordered,
      ),
    /valid but not canonical/,
  );
});

test('canonical parse rejects duplicate-key input and semantic tamper', () => {
  const value = comparison();
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
      value,
    );

  const duplicate =
    canonical.replace(
      /^\{/u,
      `{"purpose":"evaluation-record-comparison",`,
    );
  assert.doesNotThrow(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonJson(
        duplicate,
      ),
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(
        duplicate,
      ),
    /valid but not canonical/,
  );

  const tampered = {
    ...value,
    recordIdentity: {
      sameRecord: true,
    },
  };
  assert.throws(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonJson(
        JSON.stringify(tampered),
      ),
    /sameRecord invariant/,
  );
});

test('stable filename preserves left-to-right comparison direction with full digests', () => {
  const forward = comparison(
    `sha256:${'1'.repeat(64)}`,
    `sha256:${'2'.repeat(64)}`,
  );
  const reverse = comparison(
    `sha256:${'2'.repeat(64)}`,
    `sha256:${'1'.repeat(64)}`,
  );

  assert.equal(
    createWorksheetReviewRouteEvaluationRecordComparisonFileName(
      forward,
    ),
    `worksheet-review-route-evaluation-record-comparison-${'1'.repeat(64)}-to-${'2'.repeat(64)}.json`,
  );
  assert.equal(
    createWorksheetReviewRouteEvaluationRecordComparisonFileName(
      reverse,
    ),
    `worksheet-review-route-evaluation-record-comparison-${'2'.repeat(64)}-to-${'1'.repeat(64)}.json`,
  );
  assert.notEqual(
    createWorksheetReviewRouteEvaluationRecordComparisonFileName(
      forward,
    ),
    createWorksheetReviewRouteEvaluationRecordComparisonFileName(
      reverse,
    ),
  );
});

test('artifact descriptor is transport-neutral and contains canonical content', () => {
  const value = comparison();
  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordComparisonJsonArtifact(
      value,
    );

  assert.equal(
    artifact.codecVersion,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_JSON_CODEC_VERSION,
  );
  assert.equal(
    artifact.mediaType,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_MEDIA_TYPE,
  );
  assert.equal(
    artifact.content,
    serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
      value,
    ),
  );
  assert.match(
    artifact.fileName,
    /^worksheet-review-route-evaluation-record-comparison-[0-9a-f]{64}-to-[0-9a-f]{64}\.json$/u,
  );
});

test('serializer rejects non-finite values and does not mutate source comparison', () => {
  const value = comparison();
  const before = structuredClone(value);

  serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
    value,
  );
  assert.deepEqual(value, before);

  const invalid =
    structuredClone(value) as unknown as Record<string, unknown>;
  invalid.extraMetric = Number.NaN;

  assert.throws(
    () =>
      serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
        invalid as unknown as WorksheetReviewRouteEvaluationRecordComparisonV1,
      ),
    /Unknown worksheet review-route evaluation record comparison field/,
  );
});

// Keep this import path exercised by the repository build without duplicating
// the full issue-0181 record fixture in this codec-focused test.
void compareWorksheetReviewRouteEvaluationRecords;
void (null as unknown as WorksheetReviewRouteEvaluationRecordV1);
