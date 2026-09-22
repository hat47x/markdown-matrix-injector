import { createHash } from 'node:crypto';
import {
  assertWorksheetReviewRouteEvaluationRecord,
  type WorksheetReviewRouteEvaluationRecordV1,
} from './worksheetReviewRouteEvaluationRecord.js';
import {
  compareWorksheetReviewRouteEvaluationRecords,
} from './worksheetReviewRouteEvaluationRecordComparison.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from './worksheetReviewRouteEvaluationRecordComparisonPolicy.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-plan-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION =
  'worksheet-review-route-evaluation-record-comparison-plan-v1' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION;
  purpose: 'predeclared-evaluation-record-comparison';
  leftRecordDigest: string;
  rightRecordDigest: string;
  policy:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1;
  planDigest: string;
}

export interface WorksheetReviewRouteEvaluationRecordPlannedComparisonResultV1 {
  status: 'completed';
  planDigest: string;
  result:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1;
}

const PLAN_KEYS = [
  'schemaVersion',
  'representation',
  'purpose',
  'leftRecordDigest',
  'rightRecordDigest',
  'policy',
  'planDigest',
] as const;

export function createWorksheetReviewRouteEvaluationRecordComparisonPlan(
  left: WorksheetReviewRouteEvaluationRecordV1,
  right: WorksheetReviewRouteEvaluationRecordV1,
  policy:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
): WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
  assertWorksheetReviewRouteEvaluationRecord(left);
  assertWorksheetReviewRouteEvaluationRecord(right);
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    policy,
  );

  const snapshot = structuredClone(policy);
  const base = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION,
    purpose:
      'predeclared-evaluation-record-comparison' as const,
    leftRecordDigest: left.recordDigest,
    rightRecordDigest: right.recordDigest,
    policy: snapshot,
  };

  return {
    ...base,
    planDigest: createPlanDigest(
      base.leftRecordDigest,
      base.rightRecordDigest,
      base.policy,
    ),
  };
}

export function assertWorksheetReviewRouteEvaluationRecordComparisonPlan(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
  const plan = requireRecord(
    value,
    'worksheet review-route evaluation record comparison plan',
  );
  assertExactKeys(
    plan,
    PLAN_KEYS,
    'evaluation record comparison plan',
  );

  if (
    plan.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_SCHEMA_VERSION
    || plan.representation !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION
    || plan.purpose !==
      'predeclared-evaluation-record-comparison'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation record comparison plan identity.',
    );
  }

  assertDigest(plan.leftRecordDigest, 'left');
  assertDigest(plan.rightRecordDigest, 'right');
  assertDigest(plan.planDigest, 'plan');

  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    plan.policy,
  );

  const expected = createPlanDigest(
    plan.leftRecordDigest,
    plan.rightRecordDigest,
    plan.policy,
  );
  if (plan.planDigest !== expected) {
    throw new Error(
      'Worksheet review-route evaluation record comparison plan digest does not match its contents.',
    );
  }
}

export function runWorksheetReviewRouteEvaluationRecordComparisonPlan(
  left: WorksheetReviewRouteEvaluationRecordV1,
  right: WorksheetReviewRouteEvaluationRecordV1,
  plan:
    WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
): WorksheetReviewRouteEvaluationRecordPlannedComparisonResultV1 {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan(
    plan,
  );
  assertWorksheetReviewRouteEvaluationRecord(left);
  assertWorksheetReviewRouteEvaluationRecord(right);

  if (left.recordDigest !== plan.leftRecordDigest) {
    throw new Error(
      'Worksheet review-route comparison left record does not match the predeclared plan.',
    );
  }
  if (right.recordDigest !== plan.rightRecordDigest) {
    throw new Error(
      'Worksheet review-route comparison right record does not match the predeclared plan.',
    );
  }

  const comparison =
    compareWorksheetReviewRouteEvaluationRecords(
      left,
      right,
    );
  const result =
    evaluateWorksheetReviewRouteEvaluationRecordComparisonPolicy(
      comparison,
      plan.policy,
    );

  return {
    status: 'completed',
    planDigest: plan.planDigest,
    result,
  };
}

function createPlanDigest(
  leftRecordDigest: string,
  rightRecordDigest: string,
  policy:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
): string {
  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_REPRESENTATION,
    leftRecordDigest,
    rightRecordDigest,
    [
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_SCHEMA_VERSION,
      'explicit-comparison-change-policy',
      [
        policy.allowedChanges.recordIdentity,
        policy.allowedChanges.planDigest,
        policy.allowedChanges.packetDigest,
        policy.allowedChanges.readinessPolicy,
        policy.allowedChanges.planProvider,
        policy.allowedChanges.response,
        policy.allowedChanges.groundTruth,
        policy.allowedChanges.summary,
        policy.allowedChanges.projectionSeparability,
        policy.allowedChanges.reportProvider,
      ],
      policy.labelOnlyReevaluation,
    ],
  ]);

  return `sha256:${createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex')}`;
}

function assertDigest(
  value: unknown,
  side: 'left' | 'right' | 'plan',
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      `Worksheet review-route comparison plan ${side} digest must use sha256:<64 hex>.`,
    );
  }
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
