import {
  assertWorksheetReviewRouteEvaluationRecordComparison,
  type WorksheetReviewRouteEvaluationRecordComparisonV1,
} from './worksheetReviewRouteEvaluationRecordComparison.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_JSON_CODEC_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-json-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_MEDIA_TYPE =
  'application/vnd.mmi.worksheet-review-route-evaluation-record-comparison+json' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonJsonArtifactV1 {
  codecVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_JSON_CODEC_VERSION;
  mediaType:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_MEDIA_TYPE;
  fileName: string;
  content: string;
}

export function serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
  comparison: WorksheetReviewRouteEvaluationRecordComparisonV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparison(
    comparison,
  );
  return JSON.stringify(canonicalizeJson(comparison));
}

export function parseWorksheetReviewRouteEvaluationRecordComparisonJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  if (typeof text !== 'string') {
    throw new Error(
      'Worksheet review-route evaluation record comparison JSON must be a string.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Worksheet review-route evaluation record comparison JSON is invalid.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparison(
    parsed,
  );
  return structuredClone(parsed);
}

export function parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonV1 {
  const comparison =
    parseWorksheetReviewRouteEvaluationRecordComparisonJson(
      text,
    );
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
      comparison,
    );

  if (text !== canonical) {
    throw new Error(
      'Worksheet review-route evaluation record comparison JSON is valid but not canonical.',
    );
  }

  return comparison;
}

export function createWorksheetReviewRouteEvaluationRecordComparisonFileName(
  comparison: WorksheetReviewRouteEvaluationRecordComparisonV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparison(
    comparison,
  );

  const left =
    extractDigestHex(
      comparison.leftRecordDigest,
      'left',
    );
  const right =
    extractDigestHex(
      comparison.rightRecordDigest,
      'right',
    );

  return `worksheet-review-route-evaluation-record-comparison-${left}-to-${right}.json`;
}

export function prepareWorksheetReviewRouteEvaluationRecordComparisonJsonArtifact(
  comparison: WorksheetReviewRouteEvaluationRecordComparisonV1,
): WorksheetReviewRouteEvaluationRecordComparisonJsonArtifactV1 {
  return {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_MEDIA_TYPE,
    fileName:
      createWorksheetReviewRouteEvaluationRecordComparisonFileName(
        comparison,
      ),
    content:
      serializeWorksheetReviewRouteEvaluationRecordComparisonJson(
        comparison,
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
      `Worksheet review-route evaluation record comparison ${side} digest cannot form a stable filename.`,
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
        'Worksheet review-route evaluation record comparison JSON cannot encode a non-finite number.',
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
      'Worksheet review-route evaluation record comparison JSON can only encode plain objects.',
    );
  }

  const source =
    value as Record<string, unknown>;
  const canonical:
    Record<string, unknown> =
      Object.create(null);

  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route evaluation record comparison JSON cannot encode undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }

  return canonical;
}
