import {
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
} from './worksheetReviewRouteEvaluationRecordComparisonPolicy.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_JSON_CODEC_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-policy-json-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_MEDIA_TYPE =
  'application/vnd.mmi.worksheet-review-route-evaluation-record-comparison-policy+json' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_FILE_NAME =
  'worksheet-review-route-evaluation-record-comparison-policy.json' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonPolicyJsonArtifactV1 {
  codecVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_JSON_CODEC_VERSION;
  mediaType:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_MEDIA_TYPE;
  fileName:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_FILE_NAME;
  content: string;
}

export function serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
  policy: WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    policy,
  );
  return JSON.stringify(canonicalizeJson(policy));
}

export function parseWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  if (typeof text !== 'string') {
    throw new Error(
      'Worksheet review-route comparison policy JSON must be a string.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Worksheet review-route comparison policy JSON is invalid.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparisonPolicy(
    parsed,
  );
  return structuredClone(parsed);
}

export function parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyV1 {
  const policy =
    parseWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      text,
    );
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
      policy,
    );

  if (text !== canonical) {
    throw new Error(
      'Worksheet review-route comparison policy JSON is valid but not canonical.',
    );
  }

  return policy;
}

export function prepareWorksheetReviewRouteEvaluationRecordComparisonPolicyJsonArtifact(
  policy: WorksheetReviewRouteEvaluationRecordComparisonPolicyV1,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyJsonArtifactV1 {
  return {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_MEDIA_TYPE,
    fileName:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_FILE_NAME,
    content:
      serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyJson(
        policy,
      ),
  };
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
        'Worksheet review-route comparison policy JSON cannot encode a non-finite number.',
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
    || Object.getPrototypeOf(value)
      !== Object.prototype
  ) {
    throw new Error(
      'Worksheet review-route comparison policy JSON can only encode plain objects.',
    );
  }

  const source = value as Record<string, unknown>;
  const canonical: Record<string, unknown> =
    Object.create(null);

  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route comparison policy JSON cannot encode undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }

  return canonical;
}
