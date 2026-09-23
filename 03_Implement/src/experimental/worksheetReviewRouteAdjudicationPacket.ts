import { createHash } from 'node:crypto';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  assertWorksheetReviewRouteLabelCorpus,
  type WorksheetReviewRouteAdjudicationV1,
  type WorksheetReviewRouteAnnotationV1,
  type WorksheetReviewRouteEvidenceV1,
  type WorksheetReviewRouteLabelCaseV1,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ANNOTATION_ROUTES,
  type WorksheetReviewRouteAnnotationRouteDefinitionV1,
} from './worksheetReviewRouteAnnotationPacket.js';
import type {
  WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';

export const WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_SCHEMA_VERSION =
  'mmi-worksheet-review-route-adjudication-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION =
  'mmi-worksheet-review-route-adjudication-response-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_REPRESENTATION =
  'worksheet-review-route-adjudication-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION =
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS;

export interface WorksheetReviewRouteAdjudicationAnnotationV1 {
  route: WorksheetReviewRouteChoice;
  rationaleCodes: readonly string[];
}

export interface WorksheetReviewRouteAdjudicationPacketCaseV1 {
  id: string;
  evidence: WorksheetReviewRouteEvidenceV1;
  annotations: readonly WorksheetReviewRouteAdjudicationAnnotationV1[];
}

export interface WorksheetReviewRouteAdjudicationPacketV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_REPRESENTATION;
  purpose: 'blinded-adjudication';
  packetDigest: string;
  routes: Readonly<
    Record<
      WorksheetReviewRouteChoice,
      WorksheetReviewRouteAnnotationRouteDefinitionV1
    >
  >;
  minimumAnnotationsPerCase:
    typeof WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION;
  cases: readonly WorksheetReviewRouteAdjudicationPacketCaseV1[];
}

export interface WorksheetReviewRouteAdjudicationDecisionV1 {
  caseId: string;
  route: WorksheetReviewRouteChoice;
  rationaleCodes: readonly string[];
}

export interface WorksheetReviewRouteAdjudicationResponseV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  packetDigest: string;
  adjudicatorRef: string;
  decisions: readonly WorksheetReviewRouteAdjudicationDecisionV1[];
}

const RESPONSE_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'packetDigest',
  'adjudicatorRef',
  'decisions',
] as const;

const DECISION_KEYS = [
  'caseId',
  'route',
  'rationaleCodes',
] as const;

export function createWorksheetReviewRouteAdjudicationPacket(
  corpus: WorksheetReviewRouteLabelCorpusV1,
): WorksheetReviewRouteAdjudicationPacketV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);

  const cases = corpus.cases
    .filter(
      (entry) =>
        entry.adjudication === undefined
        && entry.annotations.length >=
          WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION,
    )
    .map((entry) => ({
      id: entry.id,
      evidence: cloneEvidence(entry.evidence),
      annotations: entry.annotations
        .map(projectAnnotation)
        .sort(compareProjectedAnnotations),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const packetBase = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_REPRESENTATION,
    purpose: 'blinded-adjudication' as const,
    routes: cloneRoutes(),
    minimumAnnotationsPerCase:
      WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION,
    cases,
  };

  return {
    ...packetBase,
    packetDigest: createPacketDigest(
      packetBase.routes,
      packetBase.cases,
    ),
  };
}

export function assertWorksheetReviewRouteAdjudicationResponse(
  value: unknown,
): asserts value is WorksheetReviewRouteAdjudicationResponseV1 {
  const response = requireRecord(
    value,
    'worksheet review-route adjudication response',
  );
  assertExactKeys(
    response,
    RESPONSE_KEYS,
    'adjudication response',
  );

  if (
    response.schemaVersion !==
    WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route adjudication response schema version.',
    );
  }
  if (
    response.protocolVersion !==
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route adjudication protocol version.',
    );
  }

  assertDigest(response.packetDigest);
  assertNonEmpty('adjudicator ref', response.adjudicatorRef);

  if (!Array.isArray(response.decisions)) {
    throw new Error(
      'Worksheet review-route adjudication decisions must be an array.',
    );
  }

  const ids = new Set<string>();
  for (const decision of response.decisions) {
    assertDecision(decision);
    if (ids.has(decision.caseId)) {
      throw new Error(
        `Duplicate worksheet review-route adjudication decision case id: ${decision.caseId}.`,
      );
    }
    ids.add(decision.caseId);
  }
}

export function applyWorksheetReviewRouteAdjudicationResponse(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  response: WorksheetReviewRouteAdjudicationResponseV1,
): WorksheetReviewRouteLabelCorpusV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertWorksheetReviewRouteAdjudicationResponse(response);

  const packet = createWorksheetReviewRouteAdjudicationPacket(
    corpus,
  );
  if (packet.packetDigest !== response.packetDigest) {
    throw new Error(
      'Worksheet review-route adjudication response is stale for the current evidence/annotation packet.',
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
        `Worksheet review-route adjudication case is unknown, ineligible, or already adjudicated: ${caseId}.`,
      );
    }
  }

  const cases = corpus.cases.map((entry) => {
    const decision = decisionById.get(entry.id);
    if (decision === undefined) {
      return cloneCase(entry);
    }

    if (
      entry.annotations.some(
        (annotation) =>
          annotation.annotatorRef === response.adjudicatorRef,
      )
    ) {
      throw new Error(
        `Worksheet review-route adjudicator previously annotated case: ${entry.id}.`,
      );
    }

    const adjudication: WorksheetReviewRouteAdjudicationV1 = {
      adjudicatorRef: response.adjudicatorRef,
      route: decision.route,
      rationaleCodes: [...decision.rationaleCodes],
      adjudicationReference:
        createAdjudicationReference(
          response.packetDigest,
          entry.id,
          response.adjudicatorRef,
        ),
    };

    return {
      ...cloneCase(entry),
      adjudication,
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

function createPacketDigest(
  routes: WorksheetReviewRouteAdjudicationPacketV1['routes'],
  cases: readonly WorksheetReviewRouteAdjudicationPacketCaseV1[],
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
      entry.annotations.map((annotation) => [
        annotation.route,
        [...annotation.rationaleCodes].sort(),
      ]),
    ]);

  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_ADJUDICATION_PACKET_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION,
    canonicalRoutes,
    canonicalCases,
  ]);

  const digest = createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');

  return `sha256:${digest}`;
}

function projectAnnotation(
  annotation: WorksheetReviewRouteAnnotationV1,
): WorksheetReviewRouteAdjudicationAnnotationV1 {
  return {
    route: annotation.route,
    rationaleCodes: [...annotation.rationaleCodes].sort(),
  };
}

function compareProjectedAnnotations(
  left: WorksheetReviewRouteAdjudicationAnnotationV1,
  right: WorksheetReviewRouteAdjudicationAnnotationV1,
): number {
  return canonicalAnnotationKey(left).localeCompare(
    canonicalAnnotationKey(right),
  );
}

function canonicalAnnotationKey(
  annotation: WorksheetReviewRouteAdjudicationAnnotationV1,
): string {
  return JSON.stringify([
    annotation.route,
    [...annotation.rationaleCodes].sort(),
  ]);
}

function cloneRoutes():
  WorksheetReviewRouteAdjudicationPacketV1['routes'] {
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

function createAdjudicationReference(
  packetDigest: string,
  caseId: string,
  adjudicatorRef: string,
): string {
  return `adjudication:${packetDigest}:${caseId}:${adjudicatorRef}`;
}

function assertDecision(
  value: unknown,
): asserts value is WorksheetReviewRouteAdjudicationDecisionV1 {
  const decision = requireRecord(
    value,
    'worksheet review-route adjudication decision',
  );
  assertExactKeys(
    decision,
    DECISION_KEYS,
    'adjudication decision',
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
      'Worksheet review-route adjudication packet digest must be sha256:<64 hex>.',
    );
  }
}

function assertRoute(
  value: unknown,
): asserts value is WorksheetReviewRouteChoice {
  if (value !== 'inspect' && value !== 'routine') {
    throw new Error(
      `Unsupported worksheet review-route adjudication route: ${String(value)}.`,
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
