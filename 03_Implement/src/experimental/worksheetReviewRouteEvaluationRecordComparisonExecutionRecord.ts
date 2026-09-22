import { createHash } from 'node:crypto';
import {
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1,
} from './worksheetReviewRouteEvaluationRecordComparisonPolicy.js';
import {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan,
  type WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
  type WorksheetReviewRouteEvaluationRecordPlannedComparisonResultV1,
} from './worksheetReviewRouteEvaluationRecordComparisonPlan.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-execution-record-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_REPRESENTATION =
  'worksheet-review-route-evaluation-record-comparison-execution-record-v1' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_SCHEMA_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_REPRESENTATION;
  purpose: 'planned-comparison-execution-record';
  planDigest: string;
  leftRecordDigest: string;
  rightRecordDigest: string;
  plan:
    WorksheetReviewRouteEvaluationRecordComparisonPlanV1;
  result:
    WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1;
  executionDigest: string;
}

const RECORD_KEYS = [
  'schemaVersion',
  'representation',
  'purpose',
  'planDigest',
  'leftRecordDigest',
  'rightRecordDigest',
  'plan',
  'result',
  'executionDigest',
] as const;

export function createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
  plan: WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
  completed:
    WorksheetReviewRouteEvaluationRecordPlannedComparisonResultV1,
): WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1 {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan(plan);

  if (
    completed.status !== 'completed'
    || completed.planDigest !== plan.planDigest
  ) {
    throw new Error(
      'Worksheet review-route comparison completed result does not match the predeclared plan.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
    completed.result,
  );

  const base = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_SCHEMA_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_REPRESENTATION,
    purpose:
      'planned-comparison-execution-record' as const,
    planDigest: plan.planDigest,
    leftRecordDigest: plan.leftRecordDigest,
    rightRecordDigest: plan.rightRecordDigest,
    plan: structuredClone(plan),
    result: structuredClone(completed.result),
  };

  const record:
    WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1 = {
      ...base,
      executionDigest: createExecutionDigest(base),
    };

  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
    record,
  );
  return record;
}

export function assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1 {
  const record = requireRecord(
    value,
    'worksheet review-route comparison execution record',
  );
  assertExactKeys(
    record,
    RECORD_KEYS,
    'comparison execution record',
  );

  if (
    record.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_SCHEMA_VERSION
    || record.representation !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_REPRESENTATION
    || record.purpose !==
      'planned-comparison-execution-record'
  ) {
    throw new Error(
      'Invalid worksheet review-route comparison execution record identity.',
    );
  }

  assertDigest(record.planDigest, 'plan');
  assertDigest(record.leftRecordDigest, 'left record');
  assertDigest(record.rightRecordDigest, 'right record');
  assertDigest(record.executionDigest, 'execution');

  assertWorksheetReviewRouteEvaluationRecordComparisonPlan(
    record.plan,
  );
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
    record.result,
  );

  const plan =
    record.plan as WorksheetReviewRouteEvaluationRecordComparisonPlanV1;
  const result =
    record.result as WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1;

  if (
    record.planDigest !== plan.planDigest
    || record.leftRecordDigest !==
      plan.leftRecordDigest
    || record.rightRecordDigest !==
      plan.rightRecordDigest
  ) {
    throw new Error(
      'Worksheet review-route comparison execution record plan linkage mismatch.',
    );
  }

  if (
    result.comparison.leftRecordDigest !==
      record.leftRecordDigest
    || result.comparison.rightRecordDigest !==
      record.rightRecordDigest
  ) {
    throw new Error(
      'Worksheet review-route comparison execution record result pair does not match the predeclared plan.',
    );
  }

  if (!sameCanonicalJson(result.policy, plan.policy)) {
    throw new Error(
      'Worksheet review-route comparison execution record result policy does not match the predeclared plan.',
    );
  }

  const expectedDigest = createExecutionDigest({
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_SCHEMA_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_REPRESENTATION,
    purpose:
      'planned-comparison-execution-record',
    planDigest: record.planDigest,
    leftRecordDigest: record.leftRecordDigest,
    rightRecordDigest: record.rightRecordDigest,
    plan,
    result,
  });

  if (record.executionDigest !== expectedDigest) {
    throw new Error(
      'Worksheet review-route comparison execution record digest does not match its contents.',
    );
  }
}

function createExecutionDigest(
  value: unknown,
): string {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify(canonicalizeJson(value)),
      'utf8',
    )
    .digest('hex')}`;
}

function sameCanonicalJson(
  left: unknown,
  right: unknown,
): boolean {
  return JSON.stringify(canonicalizeJson(left))
    === JSON.stringify(canonicalizeJson(right));
}

function canonicalizeJson(
  value: unknown,
): unknown {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        'Worksheet review-route comparison execution record contains a non-finite number.',
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  const record = requireRecord(
    value,
    'worksheet review-route comparison execution digest value',
  );
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route comparison execution record contains undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }
  return canonical;
}

function assertDigest(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      `Worksheet review-route comparison execution ${label} digest must use sha256:<64 hex>.`,
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
