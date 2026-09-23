import { createHash } from 'node:crypto';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  assertWorksheetReviewRouteLabelCorpus,
  type WorksheetReviewRouteAnnotationV1,
  type WorksheetReviewRouteEvidenceV1,
  type WorksheetReviewRouteLabelCaseV1,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_POLICY,
  type WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_SCHEMA_VERSION =
  'mmi-worksheet-review-route-annotation-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION =
  'mmi-worksheet-review-route-annotation-response-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_REPRESENTATION =
  'worksheet-review-route-annotation-packet-v1' as const;

export interface WorksheetReviewRouteAnnotationRouteDefinitionV1 {
  attention: 'elevated' | 'standard';
  humanReviewRequired: true;
  applyAuthority: 'none';
  automaticDecision: 'none';
  description: string;
}

export interface WorksheetReviewRouteAnnotationPacketCaseV1 {
  id: string;
  evidence: WorksheetReviewRouteEvidenceV1;
}

export interface WorksheetReviewRouteAnnotationPacketV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_REPRESENTATION;
  purpose: 'blinded-annotation';
  packetDigest: string;
  routes: Readonly<
    Record<
      WorksheetReviewRouteChoice,
      WorksheetReviewRouteAnnotationRouteDefinitionV1
    >
  >;
  cases: readonly WorksheetReviewRouteAnnotationPacketCaseV1[];
}

export interface WorksheetReviewRouteAnnotationDecisionV1 {
  caseId: string;
  route: WorksheetReviewRouteChoice;
  rationaleCodes: readonly string[];
}

export interface WorksheetReviewRouteAnnotationResponseV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  packetDigest: string;
  annotatorRef: string;
  decisions: readonly WorksheetReviewRouteAnnotationDecisionV1[];
}

export const WORKSHEET_REVIEW_ROUTE_ANNOTATION_ROUTES =
  Object.freeze({
    inspect: Object.freeze({
      attention: WORKSHEET_REVIEW_ROUTE_POLICY.inspect.attention,
      humanReviewRequired: true as const,
      applyAuthority: 'none' as const,
      automaticDecision: 'none' as const,
      description:
        'Use elevated human-review attention. This does not mean reject.',
    }),
    routine: Object.freeze({
      attention: WORKSHEET_REVIEW_ROUTE_POLICY.routine.attention,
      humanReviewRequired: true as const,
      applyAuthority: 'none' as const,
      automaticDecision: 'none' as const,
      description:
        'Use standard human-review attention. This does not mean accept, approve, or authorize apply.',
    }),
  });

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

export function createWorksheetReviewRouteAnnotationPacket(
  corpus: WorksheetReviewRouteLabelCorpusV1,
): WorksheetReviewRouteAnnotationPacketV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);

  const cases = corpus.cases
    .filter((entry) => entry.adjudication === undefined)
    .map((entry) => ({
      id: entry.id,
      evidence: cloneEvidence(entry.evidence),
    }));

  const packetBase = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_REPRESENTATION,
    purpose: 'blinded-annotation' as const,
    routes: cloneRoutes(),
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

export function assertWorksheetReviewRouteAnnotationResponse(
  value: unknown,
): asserts value is WorksheetReviewRouteAnnotationResponseV1 {
  const response = requireRecord(
    value,
    'worksheet review-route annotation response',
  );
  assertExactKeys(
    response,
    RESPONSE_KEYS,
    'annotation response',
  );

  if (
    response.schemaVersion !==
    WORKSHEET_REVIEW_ROUTE_ANNOTATION_RESPONSE_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route annotation response schema version.',
    );
  }
  if (
    response.protocolVersion !==
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route annotation protocol version.',
    );
  }

  assertDigest(response.packetDigest);
  assertNonEmpty('annotator ref', response.annotatorRef);

  if (!Array.isArray(response.decisions)) {
    throw new Error(
      'Worksheet review-route annotation decisions must be an array.',
    );
  }

  const ids = new Set<string>();
  for (const decision of response.decisions) {
    assertDecision(decision);
    if (ids.has(decision.caseId)) {
      throw new Error(
        `Duplicate worksheet review-route annotation decision case id: ${decision.caseId}.`,
      );
    }
    ids.add(decision.caseId);
  }
}

export function applyWorksheetReviewRouteAnnotationResponse(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  response: WorksheetReviewRouteAnnotationResponseV1,
): WorksheetReviewRouteLabelCorpusV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertWorksheetReviewRouteAnnotationResponse(response);

  const packet = createWorksheetReviewRouteAnnotationPacket(
    corpus,
  );
  if (packet.packetDigest !== response.packetDigest) {
    throw new Error(
      'Worksheet review-route annotation response is stale for the current evidence packet.',
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
        `Worksheet review-route annotation case is unknown or already adjudicated: ${caseId}.`,
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
          annotation.annotatorRef === response.annotatorRef,
      )
    ) {
      throw new Error(
        `Worksheet review-route annotator already labeled case: ${entry.id}.`,
      );
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

function createPacketDigest(
  routes: WorksheetReviewRouteAnnotationPacketV1['routes'],
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
    WORKSHEET_REVIEW_ROUTE_ANNOTATION_PACKET_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    canonicalRoutes,
    canonicalCases,
  ]);

  const digest = createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');

  return `sha256:${digest}`;
}

function assertDecision(
  value: unknown,
): asserts value is WorksheetReviewRouteAnnotationDecisionV1 {
  const decision = requireRecord(
    value,
    'worksheet review-route annotation decision',
  );
  assertExactKeys(
    decision,
    DECISION_KEYS,
    'annotation decision',
  );

  assertNonEmpty('decision case id', decision.caseId);
  assertRoute(decision.route);
  assertStringSet(
    'decision rationale codes',
    decision.rationaleCodes,
  );
}

function cloneRoutes():
  WorksheetReviewRouteAnnotationPacketV1['routes'] {
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

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route annotation packet digest must be sha256:<64 hex>.',
    );
  }
}

function assertRoute(
  value: unknown,
): asserts value is WorksheetReviewRouteChoice {
  if (value !== 'inspect' && value !== 'routine') {
    throw new Error(
      `Unsupported worksheet review-route annotation route: ${String(value)}.`,
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
