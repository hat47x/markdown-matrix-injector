import { createHash } from 'node:crypto';
import {
  assertCognitiveProviderDescriptor,
  type CognitiveProviderDescriptor,
} from './cognitiveContract.js';
import {
  WORKSHEET_REVIEW_ROUTE_EVALUATION_REPORT_SCHEMA_VERSION,
  assertWorksheetReviewRouteEvaluationResponse,
  evaluateWorksheetReviewRouteEvaluationResponse,
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

const SUMMARY_KEYS = [
  'cases',
  'expectedInspectCases',
  'expectedRoutineCases',
  'decisionCases',
  'nonDecisionCases',
  'decisionCoverage',
  'correctDecisionCases',
  'incorrectDecisionCases',
  'decisionAccuracy',
  'inspectCorrectDecisionCases',
  'routineCorrectDecisionCases',
  'inspectRecall',
  'routineRecall',
  'unsafeRoutineCases',
  'unsafeRoutineRate',
  'unnecessaryInspectCases',
  'unnecessaryInspectRate',
  'conservativeCorrectCases',
  'conservativeAccuracy',
  'conservativeUnsafeRoutineCases',
  'conservativeUnsafeRoutineRate',
  'conservativeExtraInspectCases',
  'conservativeExtraInspectRate',
  'inspectBinaryBrierScore',
  'meanSelectedProbability',
  'meanProviderConfidence',
  'caseResults',
] as const;

const CASE_RESULT_KEYS = new Set([
  'id',
  'expectedRoute',
  'status',
  'selectedRoute',
  'providerConfidence',
  'selectedProbability',
  'inspectProbability',
  'correctDecision',
  'unsafeRoutine',
  'unnecessaryInspect',
  'conservativeEffectiveRoute',
  'conservativeCorrect',
]);

const REQUIRED_CASE_RESULT_KEYS = [
  'id',
  'expectedRoute',
  'status',
  'unsafeRoutine',
  'unnecessaryInspect',
  'conservativeEffectiveRoute',
  'conservativeCorrect',
] as const;

const SEPARABILITY_KEYS = [
  'cases',
  'exactStateGroups',
  'conflictingGroups',
  'casesInConflictingGroups',
  'exactStateOracleMaxCorrect',
  'exactStateOracleMaxAccuracy',
  'groups',
] as const;

const GROUP_KEYS = [
  'state',
  'caseIds',
  'inspectCases',
  'routineCases',
  'conflictingLabels',
] as const;

const STATE_KEYS = [
  'classification',
  'candidateCount',
  'hasWinner',
  'noveltyScore',
] as const;

export function createWorksheetReviewRouteEvaluationRecord(
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

  return buildRecord(
    plan,
    completed.run.response,
    completed.run.report,
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
  assertWorksheetReviewRouteEvaluationResponse(
    record.response,
  );
  assertEvaluationReport(record.report);

  const plan =
    record.plan as WorksheetReviewRouteEvaluationPlanV1;
  const response =
    record.response as WorksheetReviewRouteEvaluationResponseV1;
  const report =
    record.report as WorksheetReviewRouteEvaluationReportV1;

  if (
    record.planDigest !== plan.planDigest
    || record.packetDigest !== plan.packetDigest
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

  const responseIds =
    response.outcomes.map((entry) => entry.caseId);
  assertCanonicalCaseIds(responseIds);

  for (const entry of response.outcomes) {
    if (
      entry.outcome.observation.id !== entry.caseId
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

  if (
    !sameStrings(
      report.evaluatedCaseIds,
      responseIds,
    )
    || !sameStrings(
      report.summary.caseResults.map(
        (entry) => entry.id,
      ),
      responseIds,
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation record case-order linkage mismatch.',
    );
  }

  if (
    report.summary.cases !== responseIds.length
    || report.projectionSeparability.cases !==
      responseIds.length
  ) {
    throw new Error(
      'Worksheet review-route evaluation record case-count linkage mismatch.',
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

  const report =
    evaluateWorksheetReviewRouteEvaluationResponse(
      corpus,
      record.response,
    );

  return buildRecord(
    record.plan,
    record.response,
    report,
  );
}

function buildRecord(
  plan: WorksheetReviewRouteEvaluationPlanV1,
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
    packetDigest: plan.packetDigest,
    groundTruthDigest: report.groundTruthDigest,
    plan: structuredClone(plan),
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

function assertEvaluationReport(
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
  assertEvaluationSummary(report.summary);
  assertProjectionSeparability(
    report.projectionSeparability,
  );
}

function assertEvaluationSummary(
  value: unknown,
): void {
  const summary = requireRecord(
    value,
    'worksheet review-route evaluation summary',
  );
  assertExactKeys(summary, SUMMARY_KEYS, 'evaluation summary');

  const integerKeys = [
    'cases',
    'expectedInspectCases',
    'expectedRoutineCases',
    'decisionCases',
    'nonDecisionCases',
    'correctDecisionCases',
    'incorrectDecisionCases',
    'inspectCorrectDecisionCases',
    'routineCorrectDecisionCases',
    'unsafeRoutineCases',
    'unnecessaryInspectCases',
    'conservativeCorrectCases',
    'conservativeUnsafeRoutineCases',
    'conservativeExtraInspectCases',
  ] as const;
  for (const key of integerKeys) {
    assertNonNegativeInteger(key, summary[key]);
  }

  for (const key of [
    'decisionCoverage',
    'conservativeAccuracy',
  ] as const) {
    assertProbability(key, summary[key]);
  }

  for (const key of [
    'decisionAccuracy',
    'inspectRecall',
    'routineRecall',
    'unsafeRoutineRate',
    'unnecessaryInspectRate',
    'conservativeUnsafeRoutineRate',
    'conservativeExtraInspectRate',
    'inspectBinaryBrierScore',
    'meanSelectedProbability',
    'meanProviderConfidence',
  ] as const) {
    assertProbabilityOrNull(key, summary[key]);
  }

  if (!Array.isArray(summary.caseResults)) {
    throw new Error(
      'Worksheet review-route evaluation summary caseResults must be an array.',
    );
  }
  const ids: string[] = [];
  for (const result of summary.caseResults) {
    assertCaseResult(result);
    ids.push(result.id);
  }
  assertCanonicalCaseIds(ids);

  if (
    summary.cases !== summary.caseResults.length
    || summary.expectedInspectCases
      + summary.expectedRoutineCases !==
      summary.cases
    || summary.decisionCases
      + summary.nonDecisionCases !==
      summary.cases
    || summary.correctDecisionCases
      + summary.incorrectDecisionCases !==
      summary.decisionCases
  ) {
    throw new Error(
      'Worksheet review-route evaluation summary count invariants do not hold.',
    );
  }
}

function assertCaseResult(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationReportV1['summary']['caseResults'][number] {
  const result = requireRecord(
    value,
    'worksheet review-route evaluation case result',
  );

  for (const key of Object.keys(result)) {
    if (!CASE_RESULT_KEYS.has(key)) {
      throw new Error(
        `Unknown worksheet review-route evaluation case result field: ${key}.`,
      );
    }
  }
  for (const key of REQUIRED_CASE_RESULT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      throw new Error(
        `Missing worksheet review-route evaluation case result field: ${key}.`,
      );
    }
  }

  assertNonEmpty('case result id', result.id);
  assertRoute(result.expectedRoute);
  if (
    result.status !== 'decision'
    && result.status !== 'non-decision'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation case result status.',
    );
  }
  assertRoute(result.conservativeEffectiveRoute);
  assertBoolean('unsafeRoutine', result.unsafeRoutine);
  assertBoolean(
    'unnecessaryInspect',
    result.unnecessaryInspect,
  );
  assertBoolean(
    'conservativeCorrect',
    result.conservativeCorrect,
  );

  if (result.status === 'decision') {
    assertRoute(result.selectedRoute);
    assertProbability(
      'providerConfidence',
      result.providerConfidence,
    );
    assertProbability(
      'selectedProbability',
      result.selectedProbability,
    );
    assertProbability(
      'inspectProbability',
      result.inspectProbability,
    );
    assertBoolean(
      'correctDecision',
      result.correctDecision,
    );
  } else {
    for (const key of [
      'selectedRoute',
      'providerConfidence',
      'selectedProbability',
      'inspectProbability',
      'correctDecision',
    ] as const) {
      if (result[key] !== undefined) {
        throw new Error(
          `Worksheet review-route non-decision case result must not contain ${key}.`,
        );
      }
    }
  }
}

function assertProjectionSeparability(
  value: unknown,
): void {
  const result = requireRecord(
    value,
    'worksheet review-route projection separability',
  );
  assertExactKeys(
    result,
    SEPARABILITY_KEYS,
    'projection separability',
  );

  for (const key of [
    'cases',
    'exactStateGroups',
    'conflictingGroups',
    'casesInConflictingGroups',
    'exactStateOracleMaxCorrect',
  ] as const) {
    assertNonNegativeInteger(key, result[key]);
  }
  assertProbability(
    'exactStateOracleMaxAccuracy',
    result.exactStateOracleMaxAccuracy,
  );

  if (!Array.isArray(result.groups)) {
    throw new Error(
      'Worksheet review-route projection groups must be an array.',
    );
  }

  let totalCases = 0;
  for (const value of result.groups) {
    const group = requireRecord(
      value,
      'worksheet review-route projection group',
    );
    assertExactKeys(group, GROUP_KEYS, 'projection group');

    const state = requireRecord(
      group.state,
      'worksheet review-route projection state',
    );
    assertExactKeys(state, STATE_KEYS, 'projection state');
    if (
      !['matched', 'ambiguous', 'novel'].includes(
        String(state.classification),
      )
      || typeof state.candidateCount !== 'number'
      || !Number.isInteger(state.candidateCount)
      || state.candidateCount < 0
      || typeof state.hasWinner !== 'boolean'
      || !isProbability(state.noveltyScore)
      || (
        state.hasWinner === true
        && state.candidateCount < 1
      )
    ) {
      throw new Error(
        'Invalid worksheet review-route projection state.',
      );
    }

    assertStringArray(
      'projection group case ids',
      group.caseIds,
      true,
    );
    assertNonNegativeInteger(
      'projection group inspectCases',
      group.inspectCases,
    );
    assertNonNegativeInteger(
      'projection group routineCases',
      group.routineCases,
    );
    assertBoolean(
      'projection group conflictingLabels',
      group.conflictingLabels,
    );

    if (
      group.inspectCases + group.routineCases
        !== group.caseIds.length
      || group.conflictingLabels !==
        (
          group.inspectCases > 0
          && group.routineCases > 0
        )
    ) {
      throw new Error(
        'Worksheet review-route projection group invariants do not hold.',
      );
    }

    totalCases += group.caseIds.length;
  }

  if (
    result.exactStateGroups !== result.groups.length
    || result.cases !== totalCases
  ) {
    throw new Error(
      'Worksheet review-route projection separability count invariants do not hold.',
    );
  }
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

function createRecordDigest(
  value: unknown,
): string {
  const canonical =
    JSON.stringify(canonicalizeJson(value));
  return `sha256:${createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex')}`;
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

function assertBoolean(
  label: string,
  value: unknown,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      `Worksheet review-route ${label} must be boolean.`,
    );
  }
}

function assertNonNegativeInteger(
  label: string,
  value: unknown,
): asserts value is number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new Error(
      `Worksheet review-route ${label} must be a non-negative integer.`,
    );
  }
}

function assertProbability(
  label: string,
  value: unknown,
): asserts value is number {
  if (!isProbability(value)) {
    throw new Error(
      `Worksheet review-route ${label} must be a finite value between 0 and 1.`,
    );
  }
}

function assertProbabilityOrNull(
  label: string,
  value: unknown,
): void {
  if (value !== null) {
    assertProbability(label, value);
  }
}

function isProbability(
  value: unknown,
): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
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
