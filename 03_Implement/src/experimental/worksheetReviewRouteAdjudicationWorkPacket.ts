import { createHash } from 'node:crypto';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  assertWorksheetReviewRouteLabelCorpus,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
  applyWorksheetReviewRouteAdjudicationResponse,
  assertWorksheetReviewRouteAdjudicationResponse,
  createWorksheetReviewRouteAdjudicationPacket,
  type WorksheetReviewRouteAdjudicationDecisionV1,
  type WorksheetReviewRouteAdjudicationPacketCaseV1,
  type WorksheetReviewRouteAdjudicationPacketV1,
} from './worksheetReviewRouteAdjudicationPacket.js';

export const WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_SCHEMA_VERSION =
  'mmi-worksheet-review-route-adjudication-work-packet-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_RESPONSE_SCHEMA_VERSION =
  'mmi-worksheet-review-route-adjudication-work-response-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_REPRESENTATION =
  'worksheet-review-route-adjudication-work-packet-v1' as const;

export interface WorksheetReviewRouteAdjudicationWorkPacketV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_REPRESENTATION;
  purpose: 'blinded-adjudication-work';
  packetDigest: string;
  minimumAnnotationsPerCase:
    typeof WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS;
  routes: WorksheetReviewRouteAdjudicationPacketV1['routes'];
  cases: readonly WorksheetReviewRouteAdjudicationPacketCaseV1[];
}

export interface WorksheetReviewRouteAdjudicationWorkResponseV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_RESPONSE_SCHEMA_VERSION;
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

/**
 * Creates the currently assignable blinded adjudication work for one human.
 *
 * The adjudicator reference is used only as an eligibility filter. It is not
 * serialized into the packet. A case previously annotated by this adjudicator
 * is excluded before presentation, rather than being shown and rejected only
 * at apply time.
 */
export function createWorksheetReviewRouteAdjudicationWorkPacket(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  adjudicatorRef: string,
): WorksheetReviewRouteAdjudicationWorkPacketV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertNonEmpty('adjudicator ref', adjudicatorRef);

  const base = createWorksheetReviewRouteAdjudicationPacket(corpus);
  const eligibleIds = new Set(
    corpus.cases
      .filter((entry) =>
        entry.adjudication === undefined
        && entry.annotations.length >=
          WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS
        && !entry.annotations.some(
          (annotation) =>
            annotation.annotatorRef === adjudicatorRef,
        ))
      .map((entry) => entry.id),
  );

  const cases = base.cases
    .filter((entry) => eligibleIds.has(entry.id))
    .map(clonePacketCase)
    .sort((left, right) => left.id.localeCompare(right.id));

  const packetBase = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_REPRESENTATION,
    purpose: 'blinded-adjudication-work' as const,
    minimumAnnotationsPerCase:
      WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
    routes: cloneRoutes(base.routes),
    cases,
  };

  return {
    ...packetBase,
    packetDigest: createWorkPacketDigest(
      packetBase.minimumAnnotationsPerCase,
      packetBase.routes,
      packetBase.cases,
    ),
  };
}

export function assertWorksheetReviewRouteAdjudicationWorkResponse(
  value: unknown,
): asserts value is WorksheetReviewRouteAdjudicationWorkResponseV1 {
  const response = requireRecord(
    value,
    'worksheet review-route adjudication work response',
  );
  assertExactKeys(
    response,
    RESPONSE_KEYS,
    'adjudication work response',
  );

  if (
    response.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_RESPONSE_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route adjudication work response schema version.',
    );
  }

  if (
    response.protocolVersion !==
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route adjudication work protocol version.',
    );
  }

  assertDigest(response.packetDigest);
  assertNonEmpty('adjudicator ref', response.adjudicatorRef);

  // Reuse the canonical adjudication response validator for decision schema,
  // route/rationale validation and duplicate-case rejection.
  assertWorksheetReviewRouteAdjudicationResponse({
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
    protocolVersion: response.protocolVersion,
    packetDigest: response.packetDigest,
    adjudicatorRef: response.adjudicatorRef,
    decisions: response.decisions,
  });
}

export function applyWorksheetReviewRouteAdjudicationWorkResponse(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  response: WorksheetReviewRouteAdjudicationWorkResponseV1,
): WorksheetReviewRouteLabelCorpusV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);
  assertWorksheetReviewRouteAdjudicationWorkResponse(response);

  const workPacket = createWorksheetReviewRouteAdjudicationWorkPacket(
    corpus,
    response.adjudicatorRef,
  );

  if (workPacket.packetDigest !== response.packetDigest) {
    throw new Error(
      'Worksheet review-route adjudication work response is stale for the current work packet.',
    );
  }

  const workCaseIds = new Set(
    workPacket.cases.map((entry) => entry.id),
  );

  for (const decision of response.decisions) {
    if (!workCaseIds.has(decision.caseId)) {
      throw new Error(
        `Worksheet review-route adjudication work case is unknown, ineligible, previously annotated by this adjudicator, or already adjudicated: ${decision.caseId}.`,
      );
    }
  }

  // Keep issue-0170 as the canonical adjudication application path.
  const basePacket = createWorksheetReviewRouteAdjudicationPacket(corpus);
  return applyWorksheetReviewRouteAdjudicationResponse(
    corpus,
    {
      schemaVersion:
        WORKSHEET_REVIEW_ROUTE_ADJUDICATION_RESPONSE_SCHEMA_VERSION,
      protocolVersion:
        WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
      packetDigest: basePacket.packetDigest,
      adjudicatorRef: response.adjudicatorRef,
      decisions: response.decisions.map((decision) => ({
        caseId: decision.caseId,
        route: decision.route,
        rationaleCodes: [...decision.rationaleCodes],
      })),
    },
  );
}

function createWorkPacketDigest(
  minimumAnnotationsPerCase:
    typeof WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS,
  routes: WorksheetReviewRouteAdjudicationWorkPacketV1['routes'],
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
      [...entry.annotations]
        .map((annotation) => [
          annotation.route,
          [...annotation.rationaleCodes].sort(),
        ])
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right))),
    ]);

  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_ADJUDICATION_WORK_PACKET_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    minimumAnnotationsPerCase,
    canonicalRoutes,
    canonicalCases,
  ]);

  const digest = createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');

  return `sha256:${digest}`;
}

function cloneRoutes(
  routes: WorksheetReviewRouteAdjudicationPacketV1['routes'],
): WorksheetReviewRouteAdjudicationPacketV1['routes'] {
  return {
    inspect: { ...routes.inspect },
    routine: { ...routes.routine },
  };
}

function clonePacketCase(
  entry: WorksheetReviewRouteAdjudicationPacketCaseV1,
): WorksheetReviewRouteAdjudicationPacketCaseV1 {
  return {
    id: entry.id,
    evidence: {
      sourceClass: entry.evidence.sourceClass,
      caseFamily: entry.evidence.caseFamily,
      reference: entry.evidence.reference,
      facts: [...entry.evidence.facts],
    },
    annotations: entry.annotations.map((annotation) => ({
      route: annotation.route,
      rationaleCodes: [...annotation.rationaleCodes],
    })),
  };
}

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route adjudication work packet digest must be sha256:<64 hex>.',
    );
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
