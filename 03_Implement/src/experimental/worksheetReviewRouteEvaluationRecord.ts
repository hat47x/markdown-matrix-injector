import { createHash } from 'node:crypto';
import {
  assertCognitiveProviderDescriptor,
  type CognitiveProviderDescriptor,
} from './cognitiveContract.js';
import {
  analyzeWorksheetReviewRouteProjectionSeparability,
  evaluateWorksheetReviewRouteOutcomes,
} from './worksheetReviewRouteEvaluation.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_REPORT_SCHEMA_VERSION,
  WORKSHEET_REVIEW_ROUTE_GROUND_TRUTH_REPRESENTATION,
  assertWorksheetReviewRouteEvaluationPacket,
  assertWorksheetReviewRouteEvaluationResponse,
  createWorksheetReviewRouteEvaluationPacket,
  evaluateWorksheetReviewRouteEvaluationResponse,
  type WorksheetReviewRouteEvaluationPacketV1,
  type WorksheetReviewRouteEvaluationReportV1,
  type WorksheetReviewRouteEvaluationResponseV1,
} from './worksheetReviewRouteEvaluationPacket.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_SCHEMA_VERSION,
} from './worksheetReviewRouteEvaluationObservation.js';
import {
  assertWorksheetReviewRouteEvaluationPlan,
  type WorksheetReviewRouteEvaluationPlanV1,
  type WorksheetReviewRoutePlannedRunResultV1,
} from './worksheetReviewRouteEvaluationPlan.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  evaluateWorksheetReviewRouteReadiness,
} from './worksheetReviewRouteReadiness.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-record-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_REPRESENTATION =
  'worksheet-review-route-evaluation-record-v1' as const;

export interface WorksheetReviewRouteEvaluationRecordV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_REPRESENTATION;
  purpose: 'completed-provider-evaluation-record';
  planDigest: string;
  packetDigest: string;
  groundTruthDigest: string;
  plan: WorksheetReviewRouteEvaluationPlanV1;
  packet: WorksheetReviewRouteEvaluationPacketV1;
  response: WorksheetReviewRouteEvaluationResponseV1;
  report: WorksheetReviewRouteEvaluationReportV1;
  recordDigest: string;
}

const RECORD_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'representation',
  'purpose',
  'planDigest',
  'packetDigest',
  'groundTruthDigest',
  'plan',
  'packet',
  'response',
  'report',
  'recordDigest',
] as const;

const REPORT_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'purpose',
  'packetDigest',
  'groundTruthDigest',
  'provider',
  'evaluatedCaseIds',
  'summary',
  'projectionSeparability',
] as const;

export function createWorksheetReviewRouteEvaluationRecord(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  plan: WorksheetReviewRouteEvaluationPlanV1,
  completed:
    Extract<
      WorksheetReviewRoutePlannedRunResultV1,
      { status: 'completed' }
    >,
): WorksheetReviewRouteEvaluationRecordV1 {
  assertWorksheetReviewRouteEvaluationPlan(plan);

  if (completed.planDigest !== plan.planDigest) {
    throw new Error(
      'Worksheet review-route completed run does not match the evaluation plan digest.',
    );
  }

  const packet =
    createWorksheetReviewRouteEvaluationPacket(corpus);
  if (packet.packetDigest !== plan.packetDigest) {
    throw new Error(
      'Worksheet review-route completed run corpus does not match the evaluation plan packet.',
    );
  }

  const recomputedReport =
    evaluateWorksheetReviewRouteEvaluationResponse(
      corpus,
      completed.run.response,
    );

  if (
    !sameCanonicalJson(
      recomputedReport,
      completed.run.report,
    )
  ) {
    throw new Error(
      'Worksheet review-route completed run report does not match canonical offline evaluation.',
    );
  }

  return buildRecord(
    plan,
    packet,
    completed.run.response,
    recomputedReport,
  );
}

export function assertWorksheetReviewRouteEvaluationRecord(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationRecordV1 {
  const record = requireRecord(
    value,
    'worksheet review-route evaluation record',
  );
  assertExactKeys(record, RECORD_KEYS, 'evaluation record');

  if (
    record.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_SCHEMA_VERSION
    || record.protocolVersion !==
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
    || record.representation !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_REPRESENTATION
    || record.purpose !==
      'completed-provider-evaluation-record'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation record identity.',
    );
  }

  assertDigest(record.planDigest);
  assertDigest(record.packetDigest);
  assertDigest(record.groundTruthDigest);
  assertDigest(record.recordDigest);

  assertWorksheetReviewRouteEvaluationPlan(record.plan);
  assertWorksheetReviewRouteEvaluationPacket(record.packet);
  assertWorksheetReviewRouteEvaluationResponse(
    record.response,
  );
  assertBasicEvaluationReport(record.report);

  const plan =
    record.plan as WorksheetReviewRouteEvaluationPlanV1;
  const packet =
    record.packet as WorksheetReviewRouteEvaluationPacketV1;
  const response =
    record.response as WorksheetReviewRouteEvaluationResponseV1;
  const report =
    record.report as WorksheetReviewRouteEvaluationReportV1;

  if (
    record.planDigest !== plan.planDigest
    || record.packetDigest !== plan.packetDigest
    || record.packetDigest !== packet.packetDigest
    || record.packetDigest !== response.packetDigest
    || record.packetDigest !== report.packetDigest
    || record.groundTruthDigest !==
      report.groundTruthDigest
  ) {
    throw new Error(
      'Worksheet review-route evaluation record identity linkage mismatch.',
    );
  }

  assertProviderLinkage(
    plan.provider,
    response,
    report.provider,
  );

  const packetIds =
    packet.cases.map((entry) => entry.id);
  const responseIds =
    response.outcomes.map((entry) => entry.caseId);
  assertCanonicalCaseIds(packetIds);
  assertCanonicalCaseIds(responseIds);

  if (!sameStrings(packetIds, responseIds)) {
    throw new Error(
      'Worksheet review-route evaluation record response cases do not match the stored packet.',
    );
  }

  const caseDigestById = new Map(
    packet.cases.map(
      (entry) => [entry.id, entry.caseDigest] as const,
    ),
  );

  for (const entry of response.outcomes) {
    if (
      caseDigestById.get(entry.caseId)
        !== entry.caseDigest
      || entry.outcome.observation.id !== entry.caseId
      || entry.outcome.observation.sourceDigest !==
        entry.caseDigest
      || entry.outcome.observation.schemaVersion !==
        WORKSHEET_REVIEW_ROUTE_EVALUATION_OBSERVATION_SCHEMA_VERSION
    ) {
      throw new Error(
        `Worksheet review-route evaluation outcome observation linkage mismatch: ${entry.caseId}.`,
      );
    }
  }

  const labels =
    extractReportLabels(report, responseIds);

  const expectedGroundTruthDigest =
    createGroundTruthDigest(
      record.packetDigest,
      labels,
    );
  if (
    report.groundTruthDigest !==
      expectedGroundTruthDigest
  ) {
    throw new Error(
      'Worksheet review-route evaluation report ground-truth digest does not match its case labels.',
    );
  }

  const expectedSummary =
    evaluateWorksheetReviewRouteOutcomes(
      response.outcomes.map((entry) => ({
        id: entry.caseId,
        expectedRoute:
          requireExpectedRoute(
            labels,
            entry.caseId,
          ),
        outcome: entry.outcome,
      })),
    );

  if (
    !sameCanonicalJson(
      report.summary,
      expectedSummary,
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation report summary does not match the stored outcomes and labels.',
    );
  }

  const expectedSeparability =
    analyzeWorksheetReviewRouteProjectionSeparability(
      packet.cases.map((entry) => ({
        id: entry.id,
        state: { ...entry.state },
        expectedRoute:
          requireExpectedRoute(
            labels,
            entry.id,
          ),
      })),
    );

  if (
    !sameCanonicalJson(
      report.projectionSeparability,
      expectedSeparability,
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation report projection separability does not match the stored packet and labels.',
    );
  }

  if (
    !sameStrings(
      report.evaluatedCaseIds,
      responseIds,
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation record evaluated-case linkage mismatch.',
    );
  }

  const expectedDigest =
    createRecordDigest({
      schemaVersion:
        WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_SCHEMA_VERSION,
      protocolVersion:
        WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
      representation:
        WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_REPRESENTATION,
      purpose:
        'completed-provider-evaluation-record',
      planDigest: record.planDigest,
      packetDigest: record.packetDigest,
      groundTruthDigest: record.groundTruthDigest,
      plan,
      packet,
      response,
      report,
    });

  if (record.recordDigest !== expectedDigest) {
    throw new Error(
      'Worksheet review-route evaluation record digest does not match its contents.',
    );
  }
}

export function reevaluateWorksheetReviewRouteEvaluationRecord(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  record: WorksheetReviewRouteEvaluationRecordV1,
): WorksheetReviewRouteEvaluationRecordV1 {
  assertWorksheetReviewRouteEvaluationRecord(record);

  const readiness =
    evaluateWorksheetReviewRouteReadiness(
      corpus,
      record.plan.readinessPolicy,
    );
  if (!readiness.ready) {
    throw new Error(
      'Worksheet review-route evaluation record cannot be re-evaluated because current ground truth no longer satisfies the predeclared readiness policy.',
    );
  }

  const currentPacket =
    createWorksheetReviewRouteEvaluationPacket(corpus);
  if (
    currentPacket.packetDigest !==
      record.packetDigest
  ) {
    throw new Error(
      'Worksheet review-route evaluation record is stale for the current projection packet.',
    );
  }

  const report =
    evaluateWorksheetReviewRouteEvaluationResponse(
      corpus,
      record.response,
    );

  return buildRecord(
    record.plan,
    record.packet,
    record.response,
    report,
  );
}

function buildRecord(
  plan: WorksheetReviewRouteEvaluationPlanV1,
  packet: WorksheetReviewRouteEvaluationPacketV1,
  response: WorksheetReviewRouteEvaluationResponseV1,
  report: WorksheetReviewRouteEvaluationReportV1,
): WorksheetReviewRouteEvaluationRecordV1 {
  const base = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_RECORD_REPRESENTATION,
    purpose:
      'completed-provider-evaluation-record' as const,
    planDigest: plan.planDigest,
    packetDigest: packet.packetDigest,
    groundTruthDigest: report.groundTruthDigest,
    plan: structuredClone(plan),
    packet: structuredClone(packet),
    response: structuredClone(response),
    report: structuredClone(report),
  };

  const record: WorksheetReviewRouteEvaluationRecordV1 = {
    ...base,
    recordDigest: createRecordDigest(base),
  };

  assertWorksheetReviewRouteEvaluationRecord(record);
  return record;
}

function assertBasicEvaluationReport(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationReportV1 {
  const report = requireRecord(
    value,
    'worksheet review-route evaluation report',
  );
  assertExactKeys(report, REPORT_KEYS, 'evaluation report');

  if (
    report.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_REPORT_SCHEMA_VERSION
    || report.protocolVersion !==
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
    || report.purpose !==
      'adjudicated-ground-truth-evaluation'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation report identity.',
    );
  }

  assertDigest(report.packetDigest);
  assertDigest(report.groundTruthDigest);
  assertCognitiveProviderDescriptor(
    report.provider as CognitiveProviderDescriptor,
  );
  assertStringArray(
    'evaluated case ids',
    report.evaluatedCaseIds,
    true,
  );
  assertCanonicalCaseIds(
    report.evaluatedCaseIds as string[],
  );

  const summary = requireRecord(
    report.summary,
    'worksheet review-route evaluation summary',
  );
  if (!Array.isArray(summary.caseResults)) {
    throw new Error(
      'Worksheet review-route evaluation summary caseResults must be an array.',
    );
  }
  requireRecord(
    report.projectionSeparability,
    'worksheet review-route projection separability',
  );
}

function extractReportLabels(
  report: WorksheetReviewRouteEvaluationReportV1,
  expectedIds: readonly string[],
): ReadonlyMap<string, 'inspect' | 'routine'> {
  const summary = requireRecord(
    report.summary,
    'worksheet review-route evaluation summary',
  );
  if (!Array.isArray(summary.caseResults)) {
    throw new Error(
      'Worksheet review-route evaluation summary caseResults must be an array.',
    );
  }

  const labels =
    new Map<string, 'inspect' | 'routine'>();
  const ids: string[] = [];
  for (const value of summary.caseResults) {
    const result = requireRecord(
      value,
      'worksheet review-route evaluation case result',
    );
    assertNonEmpty(
      'evaluation case result id',
      result.id,
    );
    assertRoute(result.expectedRoute);
    if (labels.has(result.id)) {
      throw new Error(
        `Duplicate worksheet review-route evaluation case result id: ${result.id}.`,
      );
    }
    labels.set(
      result.id,
      result.expectedRoute,
    );
    ids.push(result.id);
  }

  assertCanonicalCaseIds(ids);
  if (!sameStrings(ids, expectedIds)) {
    throw new Error(
      'Worksheet review-route evaluation report case results do not match the stored response.',
    );
  }

  return labels;
}

function requireExpectedRoute(
  labels: ReadonlyMap<string, 'inspect' | 'routine'>,
  id: string,
): 'inspect' | 'routine' {
  const route = labels.get(id);
  if (route === undefined) {
    throw new Error(
      `Worksheet review-route evaluation report is missing expected route: ${id}.`,
    );
  }
  return route;
}

function assertProviderLinkage(
  planned: CognitiveProviderDescriptor,
  response: WorksheetReviewRouteEvaluationResponseV1,
  reported: CognitiveProviderDescriptor,
): void {
  if (!sameProvider(planned, reported)) {
    throw new Error(
      'Worksheet review-route evaluation record report provider does not match the plan.',
    );
  }

  for (const entry of response.outcomes) {
    if (!sameProvider(planned, entry.outcome.provider)) {
      throw new Error(
        `Worksheet review-route evaluation record outcome provider does not match the plan: ${entry.caseId}.`,
      );
    }
  }
}

function sameProvider(
  left: CognitiveProviderDescriptor,
  right: CognitiveProviderDescriptor,
): boolean {
  return left.id === right.id
    && left.version === right.version
    && left.category === right.category
    && left.executionBoundary ===
      right.executionBoundary
    && sameStrings(
      [...left.capabilities].sort(),
      [...right.capabilities].sort(),
    );
}

function createGroundTruthDigest(
  packetDigest: string,
  labels:
    ReadonlyMap<string, 'inspect' | 'routine'>,
): string {
  const canonicalLabels =
    [...labels.entries()]
      .sort(
        ([left], [right]) =>
          left.localeCompare(right),
      )
      .map(([id, route]) => [id, route]);

  return sha256(JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_GROUND_TRUTH_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest,
    canonicalLabels,
  ]));
}

function createRecordDigest(
  value: unknown,
): string {
  return sha256(
    JSON.stringify(canonicalizeJson(value)),
  );
}

function sameCanonicalJson(
  left: unknown,
  right: unknown,
): boolean {
  return JSON.stringify(canonicalizeJson(left))
    === JSON.stringify(canonicalizeJson(right));
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
        'Worksheet review-route evaluation record contains a non-finite number.',
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  const record = requireRecord(
    value,
    'worksheet review-route evaluation record digest value',
  );
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry === undefined) {
      throw new Error(
        'Worksheet review-route evaluation record contains undefined.',
      );
    }
    canonical[key] = canonicalizeJson(entry);
  }
  return canonical;
}

function assertCanonicalCaseIds(
  ids: readonly string[],
): void {
  assertStringArray('case ids', ids, true);
  const sorted = [...ids].sort();
  if (!sameStrings(ids, sorted)) {
    throw new Error(
      'Worksheet review-route evaluation record case ids must use canonical sorted order.',
    );
  }
}

function assertStringArray(
  label: string,
  value: unknown,
  unique: boolean,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Worksheet review-route ${label} must be an array.`,
    );
  }
  const seen = new Set<string>();
  for (const entry of value) {
    assertNonEmpty(label, entry);
    if (unique && seen.has(entry)) {
      throw new Error(
        `Duplicate worksheet review-route ${label}: ${entry}.`,
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
    || Object.getPrototypeOf(value)
      !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route evaluation record digest fields must use sha256:<64 hex>.',
    );
  }
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

function assertRoute(
  value: unknown,
): asserts value is 'inspect' | 'routine' {
  if (value !== 'inspect' && value !== 'routine') {
    throw new Error(
      `Invalid worksheet review-route route: ${String(value)}.`,
    );
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every(
      (value, index) => value === right[index],
    );
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')}`;
}
