import type {
  CognitiveProviderDescriptor,
} from './cognitiveContract.js';
import {
  assertWorksheetReviewRouteEvaluationRecord,
  type WorksheetReviewRouteEvaluationRecordV1,
} from './worksheetReviewRouteEvaluationRecord.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_REPRESENTATION =
  'worksheet-review-route-evaluation-record-comparison-v1' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_SCHEMA_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_REPRESENTATION;
  purpose: 'evaluation-record-comparison';
  leftRecordDigest: string;
  rightRecordDigest: string;
  recordIdentity: {
    sameRecord: boolean;
  };
  plan: {
    samePlanDigest: boolean;
    samePacketDigest: boolean;
    sameReadinessPolicy: boolean;
    sameProvider: boolean;
  };
  response: {
    sameResponse: boolean;
    changedCaseIds: readonly string[];
  };
  groundTruth: {
    sameGroundTruthDigest: boolean;
    changedExpectedRouteCaseIds: readonly string[];
    labelOnlyReevaluation: boolean;
  };
  report: {
    sameSummary: boolean;
    sameProjectionSeparability: boolean;
    sameProvider: boolean;
  };
}

const TOP_KEYS = [
  'schemaVersion',
  'representation',
  'purpose',
  'leftRecordDigest',
  'rightRecordDigest',
  'recordIdentity',
  'plan',
  'response',
  'groundTruth',
  'report',
] as const;

export function compareWorksheetReviewRouteEvaluationRecords(
  left: WorksheetReviewRouteEvaluationRecordV1,
  right: WorksheetReviewRouteEvaluationRecordV1,
): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  assertWorksheetReviewRouteEvaluationRecord(left);
  assertWorksheetReviewRouteEvaluationRecord(right);

  const samePlanDigest =
    left.planDigest === right.planDigest;
  const samePacketDigest =
    left.packetDigest === right.packetDigest;
  const sameResponse =
    sameCanonicalJson(
      normalizeResponse(left),
      normalizeResponse(right),
    );
  const sameGroundTruthDigest =
    left.groundTruthDigest ===
      right.groundTruthDigest;

  const comparison:
    WorksheetReviewRouteEvaluationRecordComparisonV1 = {
      schemaVersion:
        WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_SCHEMA_VERSION,
      representation:
        WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_REPRESENTATION,
      purpose: 'evaluation-record-comparison',
      leftRecordDigest: left.recordDigest,
      rightRecordDigest: right.recordDigest,
      recordIdentity: {
        sameRecord:
          left.recordDigest === right.recordDigest,
      },
      plan: {
        samePlanDigest,
        samePacketDigest,
        sameReadinessPolicy:
          sameCanonicalJson(
            left.plan.readinessPolicy,
            right.plan.readinessPolicy,
          ),
        sameProvider:
          sameProvider(
            left.plan.provider,
            right.plan.provider,
          ),
      },
      response: {
        sameResponse,
        changedCaseIds:
          changedResponseCaseIds(
            left,
            right,
          ),
      },
      groundTruth: {
        sameGroundTruthDigest,
        changedExpectedRouteCaseIds:
          changedExpectedRouteCaseIds(
            left,
            right,
          ),
        labelOnlyReevaluation:
          samePlanDigest
          && samePacketDigest
          && sameResponse
          && !sameGroundTruthDigest,
      },
      report: {
        sameSummary:
          sameCanonicalJson(
            left.report.summary,
            right.report.summary,
          ),
        sameProjectionSeparability:
          sameCanonicalJson(
            left.report.projectionSeparability,
            right.report.projectionSeparability,
          ),
        sameProvider:
          sameProvider(
            left.report.provider,
            right.report.provider,
          ),
      },
    };

  assertWorksheetReviewRouteEvaluationRecordComparison(
    comparison,
  );
  return comparison;
}

export function assertWorksheetReviewRouteEvaluationRecordComparison(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationRecordComparisonV1 {
  const comparison = requireRecord(
    value,
    'worksheet review-route evaluation record comparison',
  );
  assertExactKeys(
    comparison,
    TOP_KEYS,
    'evaluation record comparison',
  );

  if (
    comparison.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_SCHEMA_VERSION
    || comparison.representation !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_REPRESENTATION
    || comparison.purpose !==
      'evaluation-record-comparison'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation record comparison identity.',
    );
  }

  assertDigest(comparison.leftRecordDigest);
  assertDigest(comparison.rightRecordDigest);

  const recordIdentity =
    requireExactBooleanRecord(
      comparison.recordIdentity,
      ['sameRecord'],
      'record identity',
    );
  const plan =
    requireExactBooleanRecord(
      comparison.plan,
      [
        'samePlanDigest',
        'samePacketDigest',
        'sameReadinessPolicy',
        'sameProvider',
      ],
      'plan comparison',
    );

  const response = requireRecord(
    comparison.response,
    'worksheet review-route response comparison',
  );
  assertExactKeys(
    response,
    ['sameResponse', 'changedCaseIds'],
    'response comparison',
  );
  assertBoolean(
    'sameResponse',
    response.sameResponse,
  );
  assertCanonicalCaseIds(
    response.changedCaseIds,
    'response changed case ids',
  );

  const groundTruth = requireRecord(
    comparison.groundTruth,
    'worksheet review-route ground-truth comparison',
  );
  assertExactKeys(
    groundTruth,
    [
      'sameGroundTruthDigest',
      'changedExpectedRouteCaseIds',
      'labelOnlyReevaluation',
    ],
    'ground-truth comparison',
  );
  assertBoolean(
    'sameGroundTruthDigest',
    groundTruth.sameGroundTruthDigest,
  );
  assertBoolean(
    'labelOnlyReevaluation',
    groundTruth.labelOnlyReevaluation,
  );
  assertCanonicalCaseIds(
    groundTruth.changedExpectedRouteCaseIds,
    'changed expected-route case ids',
  );

  const report =
    requireExactBooleanRecord(
      comparison.report,
      [
        'sameSummary',
        'sameProjectionSeparability',
        'sameProvider',
      ],
      'report comparison',
    );

  const sameRecordExpected =
    comparison.leftRecordDigest ===
      comparison.rightRecordDigest;
  if (
    recordIdentity.sameRecord !==
      sameRecordExpected
  ) {
    throw new Error(
      'Worksheet review-route comparison sameRecord invariant does not hold.',
    );
  }

  const labelOnlyExpected =
    plan.samePlanDigest
    && plan.samePacketDigest
    && response.sameResponse
    && !groundTruth.sameGroundTruthDigest;
  if (
    groundTruth.labelOnlyReevaluation !==
      labelOnlyExpected
  ) {
    throw new Error(
      'Worksheet review-route comparison labelOnlyReevaluation invariant does not hold.',
    );
  }

  if (recordIdentity.sameRecord) {
    const allSame = [
      plan.samePlanDigest,
      plan.samePacketDigest,
      plan.sameReadinessPolicy,
      plan.sameProvider,
      response.sameResponse,
      groundTruth.sameGroundTruthDigest,
      report.sameSummary,
      report.sameProjectionSeparability,
      report.sameProvider,
    ].every(Boolean);

    if (
      !allSame
      || response.changedCaseIds.length !== 0
      || groundTruth.changedExpectedRouteCaseIds.length
        !== 0
    ) {
      throw new Error(
        'Worksheet review-route identical-record comparison invariants do not hold.',
      );
    }
  }
}

function changedResponseCaseIds(
  left: WorksheetReviewRouteEvaluationRecordV1,
  right: WorksheetReviewRouteEvaluationRecordV1,
): string[] {
  const leftById = new Map(
    left.response.outcomes.map(
      (entry) => [entry.caseId, entry] as const,
    ),
  );
  const rightById = new Map(
    right.response.outcomes.map(
      (entry) => [entry.caseId, entry] as const,
    ),
  );

  return unionSorted(
    leftById.keys(),
    rightById.keys(),
  ).filter(
    (id) =>
      !sameCanonicalJson(
        normalizeOutcomeRecord(
          leftById.get(id),
        ),
        normalizeOutcomeRecord(
          rightById.get(id),
        ),
      ),
  );
}

function normalizeResponse(
  record: WorksheetReviewRouteEvaluationRecordV1,
): unknown {
  return {
    ...record.response,
    outcomes: record.response.outcomes.map(
      normalizeOutcomeRecord,
    ),
  };
}

function normalizeOutcomeRecord(
  entry:
    WorksheetReviewRouteEvaluationRecordV1['response']['outcomes'][number]
    | undefined,
): unknown {
  if (entry === undefined) {
    return undefined;
  }

  return {
    ...entry,
    outcome: {
      ...entry.outcome,
      provider:
        canonicalProvider(
          entry.outcome.provider,
        ),
    },
  };
}

function canonicalProvider(
  provider: CognitiveProviderDescriptor,
): CognitiveProviderDescriptor {
  return {
    id: provider.id,
    version: provider.version,
    category: provider.category,
    executionBoundary: provider.executionBoundary,
    capabilities: [
      ...provider.capabilities,
    ].sort(),
  };
}

function changedExpectedRouteCaseIds(
  left: WorksheetReviewRouteEvaluationRecordV1,
  right: WorksheetReviewRouteEvaluationRecordV1,
): string[] {
  const leftById = expectedRouteById(left);
  const rightById = expectedRouteById(right);

  return unionSorted(
    leftById.keys(),
    rightById.keys(),
  ).filter(
    (id) =>
      leftById.get(id) !== rightById.get(id),
  );
}

function expectedRouteById(
  record: WorksheetReviewRouteEvaluationRecordV1,
): ReadonlyMap<string, 'inspect' | 'routine'> {
  return new Map(
    record.report.summary.caseResults.map(
      (entry) =>
        [entry.id, entry.expectedRoute] as const,
    ),
  );
}

function unionSorted(
  left: Iterable<string>,
  right: Iterable<string>,
): string[] {
  return [
    ...new Set([
      ...left,
      ...right,
    ]),
  ].sort();
}

function sameProvider(
  left: CognitiveProviderDescriptor,
  right: CognitiveProviderDescriptor,
): boolean {
  return left.id === right.id
    && left.version === right.version
    && left.category === right.category
    && left.executionBoundary ===
      right.executionBoundary
    && sameStrings(
      [...left.capabilities].sort(),
      [...right.capabilities].sort(),
    );
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
    value === undefined
    || value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        'Worksheet review-route comparison contains a non-finite number.',
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  const record = requireRecord(
    value,
    'worksheet review-route comparison canonical value',
  );
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    result[key] =
      canonicalizeJson(record[key]);
  }
  return result;
}

function requireExactBooleanRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, boolean> {
  const record = requireRecord(
    value,
    `worksheet review-route ${label}`,
  );
  assertExactKeys(record, keys, label);
  for (const key of keys) {
    assertBoolean(key, record[key]);
  }
  return record as Record<string, boolean>;
}

function assertCanonicalCaseIds(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Worksheet review-route ${label} must be an array.`,
    );
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (
      typeof id !== 'string'
      || id.trim().length === 0
    ) {
      throw new Error(
        `Worksheet review-route ${label} must contain non-empty strings.`,
      );
    }
    if (seen.has(id)) {
      throw new Error(
        `Duplicate worksheet review-route ${label}: ${id}.`,
      );
    }
    seen.add(id);
    ids.push(id);
  }

  const sorted = [...ids].sort();
  if (!sameStrings(ids, sorted)) {
    throw new Error(
      `Worksheet review-route ${label} must use canonical sorted order.`,
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
  ) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertBoolean(
  label: string,
  value: unknown,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      `Worksheet review-route ${label} must be boolean.`,
    );
  }
}

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route comparison record digests must use sha256:<64 hex>.',
    );
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every(
      (value, index) => value === right[index],
    );
}
