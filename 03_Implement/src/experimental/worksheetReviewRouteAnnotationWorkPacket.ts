import { createHash } from 'node:crypto';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  assertWorksheetReviewRouteLabelCorpus,
  type WorksheetReviewRouteAnnotationV1,
  type WorksheetReviewRouteEvidenceV1,
  type WorksheetReviewRouteLabelCaseV1,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ANNOTATION_ROUTES,
  type WorksheetReviewRouteAnnotationDecisionV1,
  type WorksheetReviewRouteAnnotationPacketCaseV1,
  type WorksheetReviewRouteAnnotationRouteDefinitionV1,
} from './worksheetReviewRouteAnnotationPacket.js';
import type {
  WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_SCHEMA_VERSION =
  'mmi-worksheet-review-route-annotation-work-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_RESPONSE_SCHEMA_VERSION =
  'mmi-worksheet-review-route-annotation-work-response-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_REPRESENTATION =
  'worksheet-review-route-annotation-work-packet-v1' as const;

export interface WorksheetReviewRouteAnnotationWorkPacketV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_REPRESENTATION;
  purpose: 'blinded-annotation-work';
  packetDigest: string;
  requiredIndependentAnnotations:
    typeof WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS;
  routes: Readonly<
    Record<
      WorksheetReviewRouteChoice,
      WorksheetReviewRouteAnnotationRouteDefinitionV1
    >
  >;
  cases: readonly WorksheetReviewRouteAnnotationPacketCaseV1[];
}

export interface WorksheetReviewRouteAnnotationWorkResponseV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_RESPONSE_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  packetDigest: string;
  annotatorRef: string;
  decisions: readonly WorksheetReviewRouteAnnotationDecisionV1[];
}

const RESPONSE_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'packetDigest',
  'annotatorRef',
  'decisions',
] as const;

const DECISION_KEYS = [
  'caseId',
  'route',
  'rationaleCodes',
] as const;

/**
 * Creates a resume-safe work packet for one annotator.
 *
 * The annotator reference is used only to filter work already completed by
 * that annotator. It is never serialized into the packet. Prior annotations,
 * annotator identities, projection state, provider output and adjudication are
 * also excluded.
 */
export function createWorksheetReviewRouteAnnotationWorkPacket(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  annotatorRef: string,
): WorksheetReviewRouteAnnotationWorkPacketV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertNonEmpty('annotator ref', annotatorRef);

  const cases = corpus.cases
    .filter((entry) => needsIndependentAnnotation(entry, annotatorRef))
    .map((entry) => ({
      id: entry.id,
      evidence: cloneEvidence(entry.evidence),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const packetBase = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_REPRESENTATION,
    purpose: 'blinded-annotation-work' as const,
    requiredIndependentAnnotations:
      WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
    routes: cloneRoutes(),
    cases,
  };

  return {
    ...packetBase,
    packetDigest: createPacketDigest(
      packetBase.requiredIndependentAnnotations,
      packetBase.routes,
      packetBase.cases,
    ),
  };
}

export function assertWorksheetReviewRouteAnnotationWorkResponse(
  value: unknown,
): asserts value is WorksheetReviewRouteAnnotationWorkResponseV1 {
  const response = requireRecord(
    value,
    'worksheet review-route annotation work response',
  );
  assertExactKeys(
    response,
    RESPONSE_KEYS,
    'annotation work response',
  );

  if (
    response.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_RESPONSE_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route annotation work response schema version.',
    );
  }

  if (
    response.protocolVersion !==
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route annotation work protocol version.',
    );
  }

  assertDigest(response.packetDigest);
  assertNonEmpty('annotator ref', response.annotatorRef);

  if (!Array.isArray(response.decisions)) {
    throw new Error(
      'Worksheet review-route annotation work decisions must be an array.',
    );
  }

  const ids = new Set<string>();
  for (const decision of response.decisions) {
    assertDecision(decision);
    if (ids.has(decision.caseId)) {
      throw new Error(
        `Duplicate worksheet review-route annotation work decision case id: ${decision.caseId}.`,
      );
    }
    ids.add(decision.caseId);
  }
}

export function applyWorksheetReviewRouteAnnotationWorkResponse(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  response: WorksheetReviewRouteAnnotationWorkResponseV1,
): WorksheetReviewRouteLabelCorpusV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertWorksheetReviewRouteAnnotationWorkResponse(response);

  const packet = createWorksheetReviewRouteAnnotationWorkPacket(
    corpus,
    response.annotatorRef,
  );

  if (packet.packetDigest !== response.packetDigest) {
    throw new Error(
      'Worksheet review-route annotation work response is stale for the current work packet.',
    );
  }

  const packetCaseIds = new Set(
    packet.cases.map((entry) => entry.id),
  );
  const decisionById = new Map(
    response.decisions.map(
      (decision) => [decision.caseId, decision] as const,
    ),
  );

  for (const caseId of decisionById.keys()) {
    if (!packetCaseIds.has(caseId)) {
      throw new Error(
        `Worksheet review-route annotation work case is unknown, already labeled by this annotator, fully annotated, or already adjudicated: ${caseId}.`,
      );
    }
  }

  const cases = corpus.cases.map((entry) => {
    const decision = decisionById.get(entry.id);
    if (decision === undefined) {
      return cloneCase(entry);
    }

    const annotation: WorksheetReviewRouteAnnotationV1 = {
      annotatorRef: response.annotatorRef,
      route: decision.route,
      rationaleCodes: [...decision.rationaleCodes],
      annotationReference:
        createAnnotationReference(
          response.packetDigest,
          entry.id,
          response.annotatorRef,
        ),
    };

    return {
      ...cloneCase(entry),
      annotations: [
        ...entry.annotations.map(cloneAnnotation),
        annotation,
      ],
    };
  });

  const updated: WorksheetReviewRouteLabelCorpusV1 = {
    schemaVersion: corpus.schemaVersion,
    protocolVersion: corpus.protocolVersion,
    purpose: corpus.purpose,
    blinding: { ...corpus.blinding },
    cases,
  };

  assertWorksheetReviewRouteLabelCorpus(updated);
  return updated;
}

function needsIndependentAnnotation(
  entry: WorksheetReviewRouteLabelCaseV1,
  annotatorRef: string,
): boolean {
  return entry.adjudication === undefined
    && entry.annotations.length <
      WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS
    && !entry.annotations.some(
      (annotation) => annotation.annotatorRef === annotatorRef,
    );
}

function createPacketDigest(
  requiredIndependentAnnotations:
    typeof WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  routes: WorksheetReviewRouteAnnotationWorkPacketV1['routes'],
  cases: readonly WorksheetReviewRouteAnnotationPacketCaseV1[],
): string {
  const canonicalRoutes = ([
    'inspect',
    'routine',
  ] as const).map((route) => [
    route,
    routes[route].attention,
    routes[route].humanReviewRequired,
    routes[route].applyAuthority,
    routes[route].automaticDecision,
    routes[route].description,
  ]);

  const canonicalCases = [...cases]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => [
      entry.id,
      entry.evidence.sourceClass,
      entry.evidence.caseFamily,
      entry.evidence.reference,
      [...entry.evidence.facts].sort(),
    ]);

  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_ANNOTATION_WORK_PACKET_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    requiredIndependentAnnotations,
    canonicalRoutes,
    canonicalCases,
  ]);

  const digest = createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');

  return `sha256:${digest}`;
}

function cloneRoutes():
  WorksheetReviewRouteAnnotationWorkPacketV1['routes'] {
  return {
    inspect: {
      ...WORKSHEET_REVIEW_ROUTE_ANNOTATION_ROUTES.inspect,
    },
    routine: {
      ...WORKSHEET_REVIEW_ROUTE_ANNOTATION_ROUTES.routine,
    },
  };
}

function cloneEvidence(
  evidence: WorksheetReviewRouteEvidenceV1,
): WorksheetReviewRouteEvidenceV1 {
  return {
    sourceClass: evidence.sourceClass,
    caseFamily: evidence.caseFamily,
    reference: evidence.reference,
    facts: [...evidence.facts],
  };
}

function cloneAnnotation(
  annotation: WorksheetReviewRouteAnnotationV1,
): WorksheetReviewRouteAnnotationV1 {
  return {
    annotatorRef: annotation.annotatorRef,
    route: annotation.route,
    rationaleCodes: [...annotation.rationaleCodes],
    annotationReference: annotation.annotationReference,
  };
}

function cloneCase(
  entry: WorksheetReviewRouteLabelCaseV1,
): WorksheetReviewRouteLabelCaseV1 {
  return {
    id: entry.id,
    evidence: cloneEvidence(entry.evidence),
    ...(entry.projectionState === undefined
      ? {}
      : { projectionState: { ...entry.projectionState } }),
    annotations: entry.annotations.map(cloneAnnotation),
    ...(entry.adjudication === undefined
      ? {}
      : {
          adjudication: {
            adjudicatorRef:
              entry.adjudication.adjudicatorRef,
            route: entry.adjudication.route,
            rationaleCodes: [
              ...entry.adjudication.rationaleCodes,
            ],
            adjudicationReference:
              entry.adjudication.adjudicationReference,
          },
        }),
  };
}

function createAnnotationReference(
  packetDigest: string,
  caseId: string,
  annotatorRef: string,
): string {
  return `annotation:${packetDigest}:${caseId}:${annotatorRef}`;
}

function assertDecision(
  value: unknown,
): asserts value is WorksheetReviewRouteAnnotationDecisionV1 {
  const decision = requireRecord(
    value,
    'worksheet review-route annotation work decision',
  );
  assertExactKeys(
    decision,
    DECISION_KEYS,
    'annotation work decision',
  );

  assertNonEmpty('decision case id', decision.caseId);
  assertRoute(decision.route);
  assertStringSet(
    'decision rationale codes',
    decision.rationaleCodes,
  );
}

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route annotation work packet digest must be sha256:<64 hex>.',
    );
  }
}

function assertRoute(
  value: unknown,
): asserts value is WorksheetReviewRouteChoice {
  if (value !== 'inspect' && value !== 'routine') {
    throw new Error(
      `Unsupported worksheet review-route annotation work route: ${String(value)}.`,
    );
  }
}

function assertStringSet(
  label: string,
  value: unknown,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
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
