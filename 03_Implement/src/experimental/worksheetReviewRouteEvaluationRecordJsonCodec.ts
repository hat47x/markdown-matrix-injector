import {
  assertWorksheetReviewRouteEvaluationRecord,
  type WorksheetReviewRouteEvaluationRecordV1,
} from './worksheetReviewRouteEvaluationRecord.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_JSON_CODEC_VERSION =
  'mmi-worksheet-review-route-evaluation-record-json-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_MEDIA_TYPE =
  'application/vnd.mmi.worksheet-review-route-evaluation-record+json' as const;

export interface WorksheetReviewRouteEvaluationRecordJsonArtifactV1 {
  codecVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_JSON_CODEC_VERSION;
  mediaType:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_MEDIA_TYPE;
  fileName: string;
  content: string;
}

export function serializeWorksheetReviewRouteEvaluationRecordJson(
  record: WorksheetReviewRouteEvaluationRecordV1,
): string {
  assertWorksheetReviewRouteEvaluationRecord(record);
  return JSON.stringify(canonicalizeJson(record));
}

export function parseWorksheetReviewRouteEvaluationRecordJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordV1 {
  if (typeof text !== 'string') {
    throw new Error(
      'Worksheet review-route evaluation record JSON must be a string.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Worksheet review-route evaluation record JSON is invalid.',
    );
  }

  assertWorksheetReviewRouteEvaluationRecord(parsed);
  return structuredClone(parsed);
}

export function parseCanonicalWorksheetReviewRouteEvaluationRecordJson(
  text: string,
): WorksheetReviewRouteEvaluationRecordV1 {
  const record =
    parseWorksheetReviewRouteEvaluationRecordJson(text);
  const canonical =
    serializeWorksheetReviewRouteEvaluationRecordJson(
      record,
    );

  if (text !== canonical) {
    throw new Error(
      'Worksheet review-route evaluation record JSON is valid but not canonical.',
    );
  }

  return record;
}

export function createWorksheetReviewRouteEvaluationRecordFileName(
  record: WorksheetReviewRouteEvaluationRecordV1,
): string {
  assertWorksheetReviewRouteEvaluationRecord(record);

  const match =
    /^sha256:([0-9a-f]{64})$/u.exec(
      record.recordDigest,
    );
  if (match === null) {
    throw new Error(
      'Worksheet review-route evaluation record digest cannot form a stable filename.',
    );
  }

  return `worksheet-review-route-evaluation-record-${match[1]}.json`;
}

export function prepareWorksheetReviewRouteEvaluationRecordJsonArtifact(
  record: WorksheetReviewRouteEvaluationRecordV1,
): WorksheetReviewRouteEvaluationRecordJsonArtifactV1 {
  return {
    codecVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_JSON_CODEC_VERSION,
    mediaType:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_MEDIA_TYPE,
    fileName:
      createWorksheetReviewRouteEvaluationRecordFileName(
        record,
      ),
    content:
      serializeWorksheetReviewRouteEvaluationRecordJson(
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
        'Worksheet review-route evaluation record JSON cannot encode a non-finite number.',
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
      'Worksheet review-route evaluation record JSON can only encode plain objects.',
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
        'Worksheet review-route evaluation record JSON cannot encode undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }

  return canonical;
}
