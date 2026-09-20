import type {
  JevWorksheetReviewRouteState,
  WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';
import type {
  WorksheetReviewRouteProjectionCase,
} from './worksheetReviewRouteEvaluation.js';

export const WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION =
  'mmi-worksheet-review-route-label-corpus-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION =
  'mmi-worksheet-review-route-labeling-v1' as const;

export type WorksheetReviewRouteEvidenceSourceClass =
  | 'synthetic'
  | 'external-xlsx'
  | 'replay';

export interface WorksheetReviewRouteLabelBlindingV1 {
  providerOutputHidden: true;
  providerIdentityHidden: true;
  modelIdentityHidden: true;
  probabilityHidden: true;
  confidenceHidden: true;
}

export interface WorksheetReviewRouteEvidenceV1 {
  sourceClass: WorksheetReviewRouteEvidenceSourceClass;
  caseFamily: string;
  reference: string;
  facts: readonly string[];
}

export interface WorksheetReviewRouteAnnotationV1 {
  annotatorRef: string;
  route: WorksheetReviewRouteChoice;
  rationaleCodes: readonly string[];
  annotationReference: string;
}

export interface WorksheetReviewRouteAdjudicationV1 {
  adjudicatorRef: string;
  route: WorksheetReviewRouteChoice;
  rationaleCodes: readonly string[];
  adjudicationReference: string;
}

export interface WorksheetReviewRouteLabelCaseV1 {
  id: string;
  evidence: WorksheetReviewRouteEvidenceV1;
  projectionState?: JevWorksheetReviewRouteState;
  annotations: readonly WorksheetReviewRouteAnnotationV1[];
  adjudication?: WorksheetReviewRouteAdjudicationV1;
}

export interface WorksheetReviewRouteLabelCorpusV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  purpose: 'independent-ground-truth';
  blinding: WorksheetReviewRouteLabelBlindingV1;
  cases: readonly WorksheetReviewRouteLabelCaseV1[];
}

export interface AdjudicatedWorksheetReviewRouteLabel {
  id: string;
  expectedRoute: WorksheetReviewRouteChoice;
}

const TOP_LEVEL_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'purpose',
  'blinding',
  'cases',
] as const;

const BLINDING_KEYS = [
  'providerOutputHidden',
  'providerIdentityHidden',
  'modelIdentityHidden',
  'probabilityHidden',
  'confidenceHidden',
] as const;

const CASE_KEYS = [
  'id',
  'evidence',
  'projectionState',
  'annotations',
  'adjudication',
] as const;

const EVIDENCE_KEYS = [
  'sourceClass',
  'caseFamily',
  'reference',
  'facts',
] as const;

const ANNOTATION_KEYS = [
  'annotatorRef',
  'route',
  'rationaleCodes',
  'annotationReference',
] as const;

const ADJUDICATION_KEYS = [
  'adjudicatorRef',
  'route',
  'rationaleCodes',
  'adjudicationReference',
] as const;

const PROJECTION_KEYS = [
  'classification',
  'candidateCount',
  'hasWinner',
  'noveltyScore',
] as const;

export function assertWorksheetReviewRouteLabelCorpus(
  value: unknown,
): asserts value is WorksheetReviewRouteLabelCorpusV1 {
  const corpus = requireRecord(
    value,
    'worksheet review-route label corpus',
  );
  assertExactKeys(corpus, TOP_LEVEL_KEYS, 'corpus');

  if (
    corpus.schemaVersion !==
    WORKSHEET_REVIEW_ROUTE_LABEL_CORPUS_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route label corpus schema version.',
    );
  }
  if (
    corpus.protocolVersion !==
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route labeling protocol version.',
    );
  }
  if (corpus.purpose !== 'independent-ground-truth') {
    throw new Error(
      'Worksheet review-route label corpus purpose must be independent-ground-truth.',
    );
  }

  assertBlinding(corpus.blinding);

  if (!Array.isArray(corpus.cases)) {
    throw new Error(
      'Worksheet review-route label corpus cases must be an array.',
    );
  }

  const ids = new Set<string>();
  for (const entry of corpus.cases) {
    assertCase(entry);
    if (ids.has(entry.id)) {
      throw new Error(
        `Duplicate worksheet review-route label case id: ${entry.id}.`,
      );
    }
    ids.add(entry.id);
  }
}

export function getAdjudicatedWorksheetReviewRouteLabels(
  corpus: WorksheetReviewRouteLabelCorpusV1,
): AdjudicatedWorksheetReviewRouteLabel[] {
  assertWorksheetReviewRouteLabelCorpus(corpus);

  return corpus.cases
    .filter(
      (entry): entry is WorksheetReviewRouteLabelCaseV1 & {
        adjudication: WorksheetReviewRouteAdjudicationV1;
      } => entry.adjudication !== undefined,
    )
    .map((entry) => ({
      id: entry.id,
      expectedRoute: entry.adjudication.route,
    }));
}

export function getAdjudicatedWorksheetReviewRouteProjectionCases(
  corpus: WorksheetReviewRouteLabelCorpusV1,
): WorksheetReviewRouteProjectionCase[] {
  assertWorksheetReviewRouteLabelCorpus(corpus);

  return corpus.cases
    .filter(
      (entry): entry is WorksheetReviewRouteLabelCaseV1 & {
        adjudication: WorksheetReviewRouteAdjudicationV1;
      } => entry.adjudication !== undefined,
    )
    .map((entry) => {
      if (entry.projectionState === undefined) {
        throw new Error(
          `Adjudicated worksheet review-route case is missing projection state: ${entry.id}.`,
        );
      }

      return {
        id: entry.id,
        state: { ...entry.projectionState },
        expectedRoute: entry.adjudication.route,
      };
    });
}

function assertBlinding(
  value: unknown,
): asserts value is WorksheetReviewRouteLabelBlindingV1 {
  const blinding = requireRecord(
    value,
    'worksheet review-route label blinding',
  );
  assertExactKeys(
    blinding,
    BLINDING_KEYS,
    'blinding',
  );

  for (const key of BLINDING_KEYS) {
    if (blinding[key] !== true) {
      throw new Error(
        `Worksheet review-route label blinding requires ${key}=true.`,
      );
    }
  }
}

function assertCase(
  value: unknown,
): asserts value is WorksheetReviewRouteLabelCaseV1 {
  const entry = requireRecord(
    value,
    'worksheet review-route label case',
  );
  assertExactKeys(entry, CASE_KEYS, 'case');

  assertNonEmpty('case id', entry.id);
  assertEvidence(entry.evidence);

  if (entry.projectionState !== undefined) {
    assertProjectionState(entry.projectionState);
  }

  if (!Array.isArray(entry.annotations)) {
    throw new Error(
      `Worksheet review-route annotations must be an array: ${entry.id}.`,
    );
  }

  const annotators = new Set<string>();
  for (const annotation of entry.annotations) {
    assertAnnotation(annotation);
    if (annotators.has(annotation.annotatorRef)) {
      throw new Error(
        `Duplicate worksheet review-route annotator ref: ${annotation.annotatorRef}.`,
      );
    }
    annotators.add(annotation.annotatorRef);
  }

  if (entry.adjudication !== undefined) {
    if (entry.annotations.length < 2) {
      throw new Error(
        `Worksheet review-route adjudication requires at least two independent annotations: ${entry.id}.`,
      );
    }
    assertAdjudication(entry.adjudication);
    if (annotators.has(entry.adjudication.adjudicatorRef)) {
      throw new Error(
        `Worksheet review-route adjudicator must be independent from case annotators: ${entry.id}.`,
      );
    }
  }
}

function assertEvidence(
  value: unknown,
): asserts value is WorksheetReviewRouteEvidenceV1 {
  const evidence = requireRecord(
    value,
    'worksheet review-route evidence',
  );
  assertExactKeys(
    evidence,
    EVIDENCE_KEYS,
    'evidence',
  );

  if (
    !['synthetic', 'external-xlsx', 'replay'].includes(
      String(evidence.sourceClass),
    )
  ) {
    throw new Error(
      'Unsupported worksheet review-route evidence source class.',
    );
  }

  assertNonEmpty('evidence case family', evidence.caseFamily);
  assertNonEmpty('evidence reference', evidence.reference);
  assertStringSet('evidence facts', evidence.facts, true);
}

function assertAnnotation(
  value: unknown,
): asserts value is WorksheetReviewRouteAnnotationV1 {
  const annotation = requireRecord(
    value,
    'worksheet review-route annotation',
  );
  assertExactKeys(
    annotation,
    ANNOTATION_KEYS,
    'annotation',
  );

  assertNonEmpty('annotator ref', annotation.annotatorRef);
  assertRoute(annotation.route);
  assertStringSet(
    'annotation rationale codes',
    annotation.rationaleCodes,
    true,
  );
  assertNonEmpty(
    'annotation reference',
    annotation.annotationReference,
  );
}

function assertAdjudication(
  value: unknown,
): asserts value is WorksheetReviewRouteAdjudicationV1 {
  const adjudication = requireRecord(
    value,
    'worksheet review-route adjudication',
  );
  assertExactKeys(
    adjudication,
    ADJUDICATION_KEYS,
    'adjudication',
  );

  assertNonEmpty(
    'adjudicator ref',
    adjudication.adjudicatorRef,
  );
  assertRoute(adjudication.route);
  assertStringSet(
    'adjudication rationale codes',
    adjudication.rationaleCodes,
    true,
  );
  assertNonEmpty(
    'adjudication reference',
    adjudication.adjudicationReference,
  );
}

function assertProjectionState(
  value: unknown,
): asserts value is JevWorksheetReviewRouteState {
  const state = requireRecord(
    value,
    'worksheet review-route projection state',
  );
  assertExactKeys(
    state,
    PROJECTION_KEYS,
    'projectionState',
  );

  if (
    !['matched', 'ambiguous', 'novel'].includes(
      String(state.classification),
    )
    || typeof state.candidateCount !== 'number'
    || !Number.isInteger(state.candidateCount)
    || state.candidateCount < 0
    || typeof state.hasWinner !== 'boolean'
    || !isProbability(state.noveltyScore)
  ) {
    throw new Error(
      'Invalid worksheet review-route projection state.',
    );
  }

  if (
    state.hasWinner === true
    && state.candidateCount < 1
  ) {
    throw new Error(
      'Worksheet review-route projection cannot have a winner without candidates.',
    );
  }
}

function assertRoute(
  value: unknown,
): asserts value is WorksheetReviewRouteChoice {
  if (value !== 'inspect' && value !== 'routine') {
    throw new Error(
      `Unsupported worksheet review route label: ${String(value)}.`,
    );
  }
}

function assertStringSet(
  label: string,
  value: unknown,
  requireNonEmpty: boolean,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  if (requireNonEmpty && value.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  const seen = new Set<string>();
  for (const entry of value) {
    assertNonEmpty(label, entry);
    if (seen.has(entry)) {
      throw new Error(
        `Duplicate ${label} value: ${entry}.`,
      );
    }
    seen.add(entry);
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
    if (
      !Object.prototype.hasOwnProperty.call(value, key)
      && !['projectionState', 'adjudication'].includes(key)
    ) {
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

function isProbability(
  value: unknown,
): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function assertNonEmpty(
  label: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
  ) {
    throw new Error(
      `Worksheet review-route ${label} must be a non-empty string.`,
    );
  }
}
