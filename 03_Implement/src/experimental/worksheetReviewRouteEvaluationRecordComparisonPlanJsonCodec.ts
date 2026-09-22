import {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan,
  type WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
} from './worksheetReviewRouteEvaluationRecordComparisonPlan.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_JSON_CODEC_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-plan-json-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_MEDIA_TYPE =
  'application/vnd.mmi.worksheet-review-route-evaluation-record-comparison-plan+json' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonPlanJsonArtifactV1 {
  codecVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_JSON_CODEC_VERSION;
  mediaType:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_MEDIA_TYPE;
  fileName: string;
  content: string;
}

export function serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
  plan: WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan(plan);
  return JSON.stringify(canonicalizeJson(plan));
}

export function parseWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
  if (typeof text !== 'string') {
    throw new Error(
      'Worksheet review-route comparison plan JSON must be a string.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Worksheet review-route comparison plan JSON is invalid.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparisonPlan(parsed);
  return structuredClone(parsed);
}

export function parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPlanJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonPlanV1 {
  const plan =
    parseWorksheetReviewRouteEvaluationRecordComparisonPlanJson(text);
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(plan);

  if (text !== canonical) {
    throw new Error(
      'Worksheet review-route comparison plan JSON is valid but not canonical.',
    );
  }

  return plan;
}

export function createWorksheetReviewRouteEvaluationRecordComparisonPlanFileName(
  plan: WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonPlan(plan);
  const match =
    /^sha256:([0-9a-f]{64})$/u.exec(plan.planDigest);
  if (match === null) {
    throw new Error(
      'Worksheet review-route comparison plan digest cannot form a stable filename.',
    );
  }
  return `worksheet-review-route-evaluation-record-comparison-plan-${match[1]}.json`;
}

export function prepareWorksheetReviewRouteEvaluationRecordComparisonPlanJsonArtifact(
  plan: WorksheetReviewRouteEvaluationRecordComparisonPlanV1,
): WorksheetReviewRouteEvaluationRecordComparisonPlanJsonArtifactV1 {
  return {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_PLAN_MEDIA_TYPE,
    fileName:
      createWorksheetReviewRouteEvaluationRecordComparisonPlanFileName(plan),
    content:
      serializeWorksheetReviewRouteEvaluationRecordComparisonPlanJson(plan),
  };
}

function canonicalizeJson(value: unknown): unknown {
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
        'Worksheet review-route comparison plan JSON cannot encode a non-finite number.',
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (
    typeof value !== 'object'
    || value === null
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(
      'Worksheet review-route comparison plan JSON can only encode plain objects.',
    );
  }

  const source = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = Object.create(null);

  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route comparison plan JSON cannot encode undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }

  return canonical;
}
