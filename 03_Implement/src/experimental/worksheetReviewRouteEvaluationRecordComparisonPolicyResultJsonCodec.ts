import {
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult,
  type WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1,
} from './worksheetReviewRouteEvaluationRecordComparisonPolicy.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_JSON_CODEC_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-policy-result-json-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_MEDIA_TYPE =
  'application/vnd.mmi.worksheet-review-route-evaluation-record-comparison-policy-result+json' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonPolicyResultJsonArtifactV1 {
  codecVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_JSON_CODEC_VERSION;
  mediaType:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_MEDIA_TYPE;
  fileName: string;
  content: string;
}

export function serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
  result: WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
    result,
  );
  return JSON.stringify(canonicalizeJson(result));
}

export function parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1 {
  if (typeof text !== 'string') {
    throw new Error(
      'Worksheet review-route comparison policy result JSON must be a string.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Worksheet review-route comparison policy result JSON is invalid.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
    parsed,
  );
  return structuredClone(parsed);
}

export function parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1 {
  const result =
    parseWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      text,
    );
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
      result,
    );

  if (text !== canonical) {
    throw new Error(
      'Worksheet review-route comparison policy result JSON is valid but not canonical.',
    );
  }

  return result;
}

export function createWorksheetReviewRouteEvaluationRecordComparisonPolicyResultFileName(
  result: WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonPolicyResult(
    result,
  );

  const left = extractDigestHex(
    result.comparison.leftRecordDigest,
    'left',
  );
  const right = extractDigestHex(
    result.comparison.rightRecordDigest,
    'right',
  );

  return `worksheet-review-route-evaluation-record-comparison-policy-result-${left}-to-${right}.json`;
}

export function prepareWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJsonArtifact(
  result: WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1,
): WorksheetReviewRouteEvaluationRecordComparisonPolicyResultJsonArtifactV1 {
  return {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_POLICY_RESULT_MEDIA_TYPE,
    fileName:
      createWorksheetReviewRouteEvaluationRecordComparisonPolicyResultFileName(
        result,
      ),
    content:
      serializeWorksheetReviewRouteEvaluationRecordComparisonPolicyResultJson(
        result,
      ),
  };
}

function extractDigestHex(
  digest: string,
  side: 'left' | 'right',
): string {
  const match =
    /^sha256:([0-9a-f]{64})$/u.exec(digest);
  if (match === null) {
    throw new Error(
      `Worksheet review-route comparison policy result ${side} digest cannot form a stable filename.`,
    );
  }
  return match[1]!;
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
        'Worksheet review-route comparison policy result JSON cannot encode a non-finite number.',
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
      'Worksheet review-route comparison policy result JSON can only encode plain objects.',
    );
  }

  const source = value as Record<string, unknown>;
  const canonical: Record<string, unknown> =
    Object.create(null);

  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route comparison policy result JSON cannot encode undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }

  return canonical;
}
