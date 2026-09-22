import {
  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord,
  type WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1,
} from './worksheetReviewRouteEvaluationRecordComparisonExecutionRecord.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_JSON_CODEC_VERSION =
  'mmi-worksheet-review-route-evaluation-record-comparison-execution-record-json-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_MEDIA_TYPE =
  'application/vnd.mmi.worksheet-review-route-evaluation-record-comparison-execution-record+json' as const;

export interface WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifactV1 {
  codecVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_JSON_CODEC_VERSION;
  mediaType:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_MEDIA_TYPE;
  fileName: string;
  content: string;
}

export function serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
  record: WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
    record,
  );
  return JSON.stringify(canonicalizeJson(record));
}

export function parseWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1 {
  if (typeof text !== 'string') {
    throw new Error(
      'Worksheet review-route comparison execution record JSON must be a string.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Worksheet review-route comparison execution record JSON is invalid.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
    parsed,
  );
  return structuredClone(parsed);
}

export function parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1 {
  const record =
    parseWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      text,
    );
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
      record,
    );

  if (text !== canonical) {
    throw new Error(
      'Worksheet review-route comparison execution record JSON is valid but not canonical.',
    );
  }

  return record;
}

export function createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordFileName(
  record: WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1,
): string {
  assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(
    record,
  );

  const match =
    /^sha256:([0-9a-f]{64})$/u.exec(
      record.executionDigest,
    );
  if (match === null) {
    throw new Error(
      'Worksheet review-route comparison execution digest cannot form a stable filename.',
    );
  }

  return `worksheet-review-route-evaluation-record-comparison-execution-${match[1]}.json`;
}

export function prepareWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifact(
  record: WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1,
): WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonArtifactV1 {
  return {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_COMPARISON_EXECUTION_RECORD_MEDIA_TYPE,
    fileName:
      createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordFileName(
        record,
      ),
    content:
      serializeWorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJson(
        record,
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
        'Worksheet review-route comparison execution record JSON cannot encode a non-finite number.',
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
      'Worksheet review-route comparison execution record JSON can only encode plain objects.',
    );
  }

  const source = value as Record<string, unknown>;
  const canonical: Record<string, unknown> =
    Object.create(null);

  for (const key of Object.keys(source).sort()) {
    const entry = source[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route comparison execution record JSON cannot encode undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }

  return canonical;
}
