import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type WorksheetReviewRouteEvaluationRecordComparisonV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparison.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult,
  evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from '../src/experimental/worksheetReviewRouteEvaluationRecordComparisonPolicy.js';

function comparison(
  overrides: Partial<
    WorksheetReviewRouteEvaluationRecordComparisonV1
  > = {},
): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  const left =
    `sha256:${'1'.repeat(64)}`;
  const right =
    overrides.rightRecordDigest
    ?? `sha256:${'2'.repeat(64)}`;

  return {
    schemaVersion:
      'mmi-worksheet-review-route-evaluation-record-comparison-v1',
    representation:
      'worksheet-review-route-evaluation-record-comparison-v1',
    purpose: 'evaluation-record-comparison',
    leftRecordDigest: left,
    rightRecordDigest: right,
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
      sameGroundTruthDigest: true,
      changedExpectedRouteCaseIds: [],
      labelOnlyReevaluation: false,
    },
    report: {
      sameSummary: true,
      sameProjectionSeparability: true,
      sameProvider: true,
    },
    ...overrides,
  };
}

function policy(
  allowed:
    Partial<
      WorksheetReviewRouteEvaluationRecordComparisonPolicyV1['allowedChanges']
    > = {},
  labelOnly:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1['labelOnlyReevaluation']
      = 'forbidden',
): WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  return {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
    purpose:
      'explicit-comparison-change-policy',
    allowedChanges: {
      recordIdentity: false,
      planDigest: false,
      packetDigest: false,
      readinessPolicy: false,
      planProvider: false,
      response: false,
      groundTruth: false,
      summary: false,
      projectionSeparability: false,
      reportProvider: false,
      ...allowed,
    },
    labelOnlyReevaluation: labelOnly,
  };
}

test('exact-identity policy passes only an identical comparison', () => {
  const digest =
    `sha256:${'a'.repeat(64)}`;
  const identical = comparison({
    leftRecordDigest: digest,
    rightRecordDigest: digest,
    recordIdentity: {
      sameRecord: true,
    },
  });

  const result =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      identical,
      policy(),
    );

  assert.equal(result.compliant, true);
  assert.deepEqual(result.violations, []);
});

test('label-only re-evaluation policy allows only its explicit change dimensions', () => {
  const labelOnlyComparison = comparison({
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
  });

  const result =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      labelOnlyComparison,
      policy(
        {
          recordIdentity: true,
          groundTruth: true,
          summary: true,
          projectionSeparability: true,
        },
        'required',
      ),
    );

  assert.equal(result.compliant, true);
  assert.deepEqual(result.violations, []);

  const forbiddenResponse =
    structuredClone(labelOnlyComparison);
  forbiddenResponse.response = {
    sameResponse: false,
    changedCaseIds: ['case-a'],
  };
  forbiddenResponse.groundTruth
    .labelOnlyReevaluation = false;

  const failed =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      forbiddenResponse,
      policy(
        {
          recordIdentity: true,
          groundTruth: true,
          summary: true,
          projectionSeparability: true,
        },
        'required',
      ),
    );

  assert.equal(failed.compliant, false);
  assert.deepEqual(
    failed.violations.map(
      (entry) => entry.code,
    ),
    [
      'LABEL_ONLY_REEVALUATION_REQUIRED',
      'RESPONSE_CHANGED',
    ],
  );
});

test('provider-rerun boundary can allow response/report changes while forbidding ground-truth changes', () => {
  const rerun = comparison({
    response: {
      sameResponse: false,
      changedCaseIds: ['case-b'],
    },
    report: {
      sameSummary: false,
      sameProjectionSeparability: true,
      sameProvider: true,
    },
  });

  const allowed =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      rerun,
      policy({
        recordIdentity: true,
        response: true,
        summary: true,
      }),
    );
  assert.equal(allowed.compliant, true);

  const mixed = structuredClone(rerun);
  mixed.groundTruth = {
    sameGroundTruthDigest: false,
    changedExpectedRouteCaseIds: ['case-a'],
    labelOnlyReevaluation: false,
  };

  const rejected =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      mixed,
      policy({
        recordIdentity: true,
        response: true,
        summary: true,
      }),
    );
  assert.deepEqual(
    rejected.violations,
    [{
      code: 'GROUND_TRUTH_CHANGED',
      dimension: 'groundTruth',
    }],
  );
});

test('reports multiple forbidden changes independently in canonical code order', () => {
  const changed = comparison({
    plan: {
      samePlanDigest: false,
      samePacketDigest: false,
      sameReadinessPolicy: false,
      sameProvider: false,
    },
    response: {
      sameResponse: false,
      changedCaseIds: ['case-a'],
    },
    groundTruth: {
      sameGroundTruthDigest: false,
      changedExpectedRouteCaseIds: ['case-a'],
      labelOnlyReevaluation: false,
    },
    report: {
      sameSummary: false,
      sameProjectionSeparability: false,
      sameProvider: false,
    },
  });

  const result =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      changed,
      policy(),
    );

  assert.equal(result.compliant, false);
  assert.deepEqual(
    result.violations.map(
      (entry) => entry.code,
    ),
    [
      'GROUND_TRUTH_CHANGED',
      'PACKET_DIGEST_CHANGED',
      'PLAN_DIGEST_CHANGED',
      'PLAN_PROVIDER_CHANGED',
      'PROJECTION_SEPARABILITY_CHANGED',
      'READINESS_POLICY_CHANGED',
      'RECORD_IDENTITY_CHANGED',
      'REPORT_PROVIDER_CHANGED',
      'RESPONSE_CHANGED',
      'SUMMARY_CHANGED',
    ],
  );
});

test('label-only constraint supports required, forbidden, and either without hidden defaults', () => {
  const labelOnlyComparison = comparison({
    groundTruth: {
      sameGroundTruthDigest: false,
      changedExpectedRouteCaseIds: ['case-a'],
      labelOnlyReevaluation: true,
    },
  });

  const baseAllowed = {
    recordIdentity: true,
    groundTruth: true,
  };

  assert.equal(
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      labelOnlyComparison,
      policy(baseAllowed, 'required'),
    ).compliant,
    true,
  );

  assert.deepEqual(
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      labelOnlyComparison,
      policy(baseAllowed, 'forbidden'),
    ).violations,
    [{
      code: 'LABEL_ONLY_REEVALUATION_FORBIDDEN',
      dimension: 'labelOnlyReevaluation',
    }],
  );

  assert.equal(
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      labelOnlyComparison,
      policy(baseAllowed, 'either'),
    ).compliant,
    true,
  );
});

test('strict policy validation rejects unknown, missing, and non-boolean fields', () => {
  const valid = policy();
  assert.doesNotThrow(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
        valid,
      ),
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicy({
        ...valid,
        defaultMode: 'strict',
      }),
    /Unknown worksheet review-route comparison policy field/,
  );

  const missing =
    structuredClone(valid) as unknown as {
      allowedChanges:
        Partial<
          WorksheetReviewRouteEvaluationRecordComparisonPolicyV1['allowedChanges']
        >;
    };
  delete missing.allowedChanges.response;
  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
        missing,
      ),
    /Missing worksheet review-route comparison allowed changes field/,
  );

  const nonBoolean =
    structuredClone(valid) as unknown as {
      allowedChanges: {
        response: string;
      };
    };
  nonBoolean.allowedChanges.response = 'yes';
  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
        nonBoolean,
      ),
    /allowedChanges.response must be boolean/,
  );
});

test('result validator recomputes violations and compliant from comparison and policy', () => {
  const changed = comparison({
    response: {
      sameResponse: false,
      changedCaseIds: ['case-a'],
    },
  });
  const result =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      changed,
      policy(),
    );

  assert.doesNotThrow(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
        result,
      ),
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult({
        ...result,
        violations: [],
        compliant: true,
      }),
    /violations do not match/,
  );

  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult({
        ...result,
        compliant: true,
      }),
    /compliant invariant/,
  );

  const unsorted =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      comparison({
        plan: {
          samePlanDigest: false,
          samePacketDigest: true,
          sameReadinessPolicy: true,
          sameProvider: true,
        },
        response: {
          sameResponse: false,
          changedCaseIds: ['case-a'],
        },
      }),
      policy(),
    );
  assert.throws(
    () =>
      assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult({
        ...unsorted,
        violations: [
          unsorted.violations[1],
          unsorted.violations[0],
        ],
      }),
    /canonically sorted/,
  );
});

test('policy evaluation does not mutate comparison or policy inputs', () => {
  const sourceComparison = comparison();
  const sourcePolicy = policy({
    recordIdentity: true,
  });
  const beforeComparison =
    structuredClone(sourceComparison);
  const beforePolicy =
    structuredClone(sourcePolicy);

  evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    sourceComparison,
    sourcePolicy,
  );

  assert.deepEqual(
    sourceComparison,
    beforeComparison,
  );
  assert.deepEqual(
    sourcePolicy,
    beforePolicy,
  );
});
