import {
  assertWorksheetReviewRouteEvaluationRecordComparison,
  type WorksheetReviewRouteEvaluationRecordComparisonV1,
} from './worksheetReviewRouteEvaluationRecordComparison.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-policy-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-policy-result-v1' as const;

export type WorksheetReviewRouteComparisonDimension =
  | 'recordIdentity'
  | 'planDigest'
  | 'packetDigest'
  | 'readinessPolicy'
  | 'planProvider'
  | 'response'
  | 'groundTruth'
  | 'summary'
  | 'projectionSeparability'
  | 'reportProvider'
  | 'labelOnlyReevaluation';

export type WorksheetReviewRouteLabelOnlyConstraint =
  | 'required'
  | 'forbidden'
  | 'either';

export interface WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION;
  purpose: 'explicit-comparison-change-policy';
  allowedChanges: {
    recordIdentity: boolean;
    planDigest: boolean;
    packetDigest: boolean;
    readinessPolicy: boolean;
    planProvider: boolean;
    response: boolean;
    groundTruth: boolean;
    summary: boolean;
    projectionSeparability: boolean;
    reportProvider: boolean;
  };
  labelOnlyReevaluation:
    WorksheetReviewRouteLabelOnlyConstraint;
}

export type WorksheetReviewRouteComparisonPolicyViolationCode =
  | 'GROUND_TRUTH_CHANGED'
  | 'LABEL_ONLY_REEVALUATION_FORBIDDEN'
  | 'LABEL_ONLY_REEVALUATION_REQUIRED'
  | 'PACKET_DIGEST_CHANGED'
  | 'PLAN_DIGEST_CHANGED'
  | 'PLAN_PROVIDER_CHANGED'
  | 'PROJECTION_SEPARABILITY_CHANGED'
  | 'READINESS_POLICY_CHANGED'
  | 'RECORD_IDENTITY_CHANGED'
  | 'REPORT_PROVIDER_CHANGED'
  | 'RESPONSE_CHANGED'
  | 'SUMMARY_CHANGED';

export interface WorksheetReviewRouteComparisonPolicyViolationV1 {
  code:
    WorksheetReviewRouteComparisonPolicyViolationCode;
  dimension:
    WorksheetReviewRouteComparisonDimension;
}

export interface WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_SCHEMA_VERSION;
  purpose: 'comparison-change-policy-result';
  comparison:
    WorksheetReviewRouteEvaluationRecordComparisonV1;
  policy:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1;
  compliant: boolean;
  violations:
    readonly WorksheetReviewRouteComparisonPolicyViolationV1[];
}

const POLICY_KEYS = [
  'schemaVersion',
  'purpose',
  'allowedChanges',
  'labelOnlyReevaluation',
] as const;

const ALLOWED_CHANGE_KEYS = [
  'recordIdentity',
  'planDigest',
  'packetDigest',
  'readinessPolicy',
  'planProvider',
  'response',
  'groundTruth',
  'summary',
  'projectionSeparability',
  'reportProvider',
] as const;

const RESULT_KEYS = [
  'schemaVersion',
  'purpose',
  'comparison',
  'policy',
  'compliant',
  'violations',
] as const;

const VIOLATION_KEYS = [
  'code',
  'dimension',
] as const;

export function evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
  comparison:
    WorksheetReviewRouteEvaluationRecordComparisonV1,
  policy:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1 {
  assertWorksheetReviewRouteEvaluationRecordComparison(
    comparison,
  );
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    policy,
  );

  const violations =
    computeViolations(comparison, policy);

  const result:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1 = {
      schemaVersion:
        WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_SCHEMA_VERSION,
      purpose: 'comparison-change-policy-result',
      comparison: structuredClone(comparison),
      policy: structuredClone(policy),
      compliant: violations.length === 0,
      violations,
    };

  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
    result,
  );
  return result;
}

export function assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  const policy = requireRecord(
    value,
    'worksheet review-route evaluation record comparison policy',
  );
  assertExactKeys(
    policy,
    POLICY_KEYS,
    'comparison policy',
  );

  if (
    policy.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION
    || policy.purpose !==
      'explicit-comparison-change-policy'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation record comparison policy identity.',
    );
  }

  const allowedChanges = requireRecord(
    policy.allowedChanges,
    'worksheet review-route comparison allowed changes',
  );
  assertExactKeys(
    allowedChanges,
    ALLOWED_CHANGE_KEYS,
    'comparison allowed changes',
  );
  for (const key of ALLOWED_CHANGE_KEYS) {
    if (typeof allowedChanges[key] !== 'boolean') {
      throw new Error(
        `Worksheet review-route comparison allowedChanges.${key} must be boolean.`,
      );
    }
  }

  if (
    !['required', 'forbidden', 'either'].includes(
      String(policy.labelOnlyReevaluation),
    )
  ) {
    throw new Error(
      'Worksheet review-route comparison labelOnlyReevaluation must be required, forbidden, or either.',
    );
  }
}

export function assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1 {
  const result = requireRecord(
    value,
    'worksheet review-route comparison policy result',
  );
  assertExactKeys(
    result,
    RESULT_KEYS,
    'comparison policy result',
  );

  if (
    result.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_SCHEMA_VERSION
    || result.purpose !==
      'comparison-change-policy-result'
  ) {
    throw new Error(
      'Invalid worksheet review-route comparison policy result identity.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparison(
    result.comparison,
  );
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    result.policy,
  );

  if (typeof result.compliant !== 'boolean') {
    throw new Error(
      'Worksheet review-route comparison policy result compliant must be boolean.',
    );
  }

  if (!Array.isArray(result.violations)) {
    throw new Error(
      'Worksheet review-route comparison policy result violations must be an array.',
    );
  }

  const stored:
    WorksheetReviewRouteComparisonPolicyViolationV1[] = [];
  const seenCodes = new Set<string>();
  let previousCode = '';

  for (const value of result.violations) {
    const violation = requireRecord(
      value,
      'worksheet review-route comparison policy violation',
    );
    assertExactKeys(
      violation,
      VIOLATION_KEYS,
      'comparison policy violation',
    );

    if (
      !isViolationCode(violation.code)
      || !isDimension(violation.dimension)
      || expectedDimensionForCode(
        violation.code,
      ) !== violation.dimension
    ) {
      throw new Error(
        'Invalid worksheet review-route comparison policy violation.',
      );
    }

    if (
      seenCodes.has(violation.code)
      || (
        previousCode !== ''
        && previousCode.localeCompare(
          violation.code,
        ) >= 0
      )
    ) {
      throw new Error(
        'Worksheet review-route comparison policy violations must be unique and canonically sorted.',
      );
    }

    seenCodes.add(violation.code);
    previousCode = violation.code;
    stored.push({
      code: violation.code,
      dimension: violation.dimension,
    });
  }

  const expected =
    computeViolations(
      result.comparison,
      result.policy,
    );

  if (!sameViolations(stored, expected)) {
    throw new Error(
      'Worksheet review-route comparison policy result violations do not match the comparison and policy.',
    );
  }

  if (
    result.compliant !== (stored.length === 0)
  ) {
    throw new Error(
      'Worksheet review-route comparison policy result compliant invariant does not hold.',
    );
  }
}

function computeViolations(
  comparison:
    WorksheetReviewRouteEvaluationRecordComparisonV1,
  policy:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
): WorksheetReviewRouteComparisonPolicyViolationV1[] {
  const violations:
    WorksheetReviewRouteComparisonPolicyViolationV1[] = [];

  pushChangeViolation(
    violations,
    !comparison.recordIdentity.sameRecord,
    policy.allowedChanges.recordIdentity,
    'RECORD_IDENTITY_CHANGED',
    'recordIdentity',
  );
  pushChangeViolation(
    violations,
    !comparison.plan.samePlanDigest,
    policy.allowedChanges.planDigest,
    'PLAN_DIGEST_CHANGED',
    'planDigest',
  );
  pushChangeViolation(
    violations,
    !comparison.plan.samePacketDigest,
    policy.allowedChanges.packetDigest,
    'PACKET_DIGEST_CHANGED',
    'packetDigest',
  );
  pushChangeViolation(
    violations,
    !comparison.plan.sameReadinessPolicy,
    policy.allowedChanges.readinessPolicy,
    'READINESS_POLICY_CHANGED',
    'readinessPolicy',
  );
  pushChangeViolation(
    violations,
    !comparison.plan.sameProvider,
    policy.allowedChanges.planProvider,
    'PLAN_PROVIDER_CHANGED',
    'planProvider',
  );
  pushChangeViolation(
    violations,
    !comparison.response.sameResponse,
    policy.allowedChanges.response,
    'RESPONSE_CHANGED',
    'response',
  );
  pushChangeViolation(
    violations,
    !comparison.groundTruth.sameGroundTruthDigest,
    policy.allowedChanges.groundTruth,
    'GROUND_TRUTH_CHANGED',
    'groundTruth',
  );
  pushChangeViolation(
    violations,
    !comparison.report.sameSummary,
    policy.allowedChanges.summary,
    'SUMMARY_CHANGED',
    'summary',
  );
  pushChangeViolation(
    violations,
    !comparison.report.sameProjectionSeparability,
    policy.allowedChanges.projectionSeparability,
    'PROJECTION_SEPARABILITY_CHANGED',
    'projectionSeparability',
  );
  pushChangeViolation(
    violations,
    !comparison.report.sameProvider,
    policy.allowedChanges.reportProvider,
    'REPORT_PROVIDER_CHANGED',
    'reportProvider',
  );

  if (
    policy.labelOnlyReevaluation === 'required'
    && !comparison.groundTruth.labelOnlyReevaluation
  ) {
    violations.push({
      code: 'LABEL_ONLY_REEVALUATION_REQUIRED',
      dimension: 'labelOnlyReevaluation',
    });
  }
  if (
    policy.labelOnlyReevaluation === 'forbidden'
    && comparison.groundTruth.labelOnlyReevaluation
  ) {
    violations.push({
      code: 'LABEL_ONLY_REEVALUATION_FORBIDDEN',
      dimension: 'labelOnlyReevaluation',
    });
  }

  return violations.sort(
    (left, right) =>
      left.code.localeCompare(right.code),
  );
}

function pushChangeViolation(
  violations:
    WorksheetReviewRouteComparisonPolicyViolationV1[],
  changed: boolean,
  allowed: boolean,
  code:
    WorksheetReviewRouteComparisonPolicyViolationCode,
  dimension:
    WorksheetReviewRouteComparisonDimension,
): void {
  if (changed && !allowed) {
    violations.push({
      code,
      dimension,
    });
  }
}

function isViolationCode(
  value: unknown,
): value is WorksheetReviewRouteComparisonPolicyViolationCode {
  return [
    'GROUND_TRUTH_CHANGED',
    'LABEL_ONLY_REEVALUATION_FORBIDDEN',
    'LABEL_ONLY_REEVALUATION_REQUIRED',
    'PACKET_DIGEST_CHANGED',
    'PLAN_DIGEST_CHANGED',
    'PLAN_PROVIDER_CHANGED',
    'PROJECTION_SEPARABILITY_CHANGED',
    'READINESS_POLICY_CHANGED',
    'RECORD_IDENTITY_CHANGED',
    'REPORT_PROVIDER_CHANGED',
    'RESPONSE_CHANGED',
    'SUMMARY_CHANGED',
  ].includes(String(value));
}

function isDimension(
  value: unknown,
): value is WorksheetReviewRouteComparisonDimension {
  return [
    'recordIdentity',
    'planDigest',
    'packetDigest',
    'readinessPolicy',
    'planProvider',
    'response',
    'groundTruth',
    'summary',
    'projectionSeparability',
    'reportProvider',
    'labelOnlyReevaluation',
  ].includes(String(value));
}

function expectedDimensionForCode(
  code:
    WorksheetReviewRouteComparisonPolicyViolationCode,
): WorksheetReviewRouteComparisonDimension {
  switch (code) {
    case 'RECORD_IDENTITY_CHANGED':
      return 'recordIdentity';
    case 'PLAN_DIGEST_CHANGED':
      return 'planDigest';
    case 'PACKET_DIGEST_CHANGED':
      return 'packetDigest';
    case 'READINESS_POLICY_CHANGED':
      return 'readinessPolicy';
    case 'PLAN_PROVIDER_CHANGED':
      return 'planProvider';
    case 'RESPONSE_CHANGED':
      return 'response';
    case 'GROUND_TRUTH_CHANGED':
      return 'groundTruth';
    case 'SUMMARY_CHANGED':
      return 'summary';
    case 'PROJECTION_SEPARABILITY_CHANGED':
      return 'projectionSeparability';
    case 'REPORT_PROVIDER_CHANGED':
      return 'reportProvider';
    case 'LABEL_ONLY_REEVALUATION_REQUIRED':
    case 'LABEL_ONLY_REEVALUATION_FORBIDDEN':
      return 'labelOnlyReevaluation';
  }
}

function sameViolations(
  left:
    readonly WorksheetReviewRouteComparisonPolicyViolationV1[],
  right:
    readonly WorksheetReviewRouteComparisonPolicyViolationV1[],
): boolean {
  return left.length === right.length
    && left.every(
      (value, index) =>
        value.code === right[index]?.code
        && value.dimension ===
          right[index]?.dimension,
    );
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new Error(
        `Unknown worksheet review-route ${label} field: ${key}.`,
      );
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(
        `Missing worksheet review-route ${label} field: ${key}.`,
      );
    }
  }
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value)
      !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}
