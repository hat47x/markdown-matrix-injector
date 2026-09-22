import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_FILE_NAME,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_JSON_CODEC_VERSION,
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_MEDIA_TYPE,
  parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson,
  parseWorksheetReviewRouteEvaluationRecordComparisonPolicyJson,
  prepareWorksheetReviewRouteEvaluationRecordComparisonPolicyJsonArtifact,
  serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicyJsonCodec.js';

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

test('serializes deterministically as compact canonical JSON and round-trips', () => {
  const source = policy();
  const before = structuredClone(source);

  const first =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      source,
    );
  const second =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      source,
    );

  assert.equal(first, second);
  assert.equal(first.includes('\n'), false);
  assert.equal(first.includes(' '), false);
  assert.deepEqual(
    parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      first,
    ),
    source,
  );
  assert.deepEqual(source, before);
});

test('normalizing parse accepts pretty JSON while canonical parse rejects it', () => {
  const pretty = JSON.stringify(policy(), null, 2);

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      pretty,
    ),
    policy(),
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        pretty,
      ),
    /not canonical/,
  );
});

test('canonical parse rejects noncanonical key order and trailing newline', () => {
  const source = policy();
  const noncanonical = JSON.stringify(source);
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      source,
    );

  assert.notEqual(noncanonical, canonical);
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        noncanonical,
      ),
    /not canonical/,
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        `${canonical}\n`,
      ),
    /not canonical/,
  );
});

test('canonical parse rejects duplicate-key JSON text', () => {
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      policy(),
    );
  const duplicate = canonical.replace(
    '"purpose":"explicit-comparison-change-policy"',
    '"purpose":"explicit-comparison-change-policy","purpose":"explicit-comparison-change-policy"',
  );

  assert.deepEqual(
    parseWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      duplicate,
    ),
    policy(),
  );
  assert.throws(
    () =>
      parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        duplicate,
      ),
    /not canonical/,
  );
});

test('semantic tamper is rejected by the issue-0183 validator boundary', () => {
  const invalid = {
    ...policy(),
    labelOnlyReevaluation: 'automatic',
  };

  assert.throws(
    () =>
      serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        invalid as never,
      ),
    /required, forbidden, or either/,
  );

  assert.throws(
    () =>
      parseWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        JSON.stringify(invalid),
      ),
    /required, forbidden, or either/,
  );
});

test('prepares a transport-neutral artifact with stable fixed metadata', () => {
  const source = policy();
  const artifact =
    prepareWorksheetReviewRouteEvaluationRecordComparisonPolicyJsonArtifact(
      source,
    );

  assert.equal(
    artifact.codecVersion,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_JSON_CODEC_VERSION,
  );
  assert.equal(
    artifact.mediaType,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_MEDIA_TYPE,
  );
  assert.equal(
    artifact.fileName,
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_FILE_NAME,
  );
  assert.equal(
    artifact.content,
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      source,
    ),
  );
});
