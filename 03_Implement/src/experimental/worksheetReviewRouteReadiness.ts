import {
  assertWorksheetReviewRouteLabelCorpus,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';

export type WorksheetReviewRouteReadinessBlockerCode =
  | 'ADJUDICATED_CASES_BELOW_MINIMUM'
  | 'ADJUDICATED_CASE_FAMILIES_BELOW_MINIMUM'
  | 'EXPECTED_ROUTE_CLASS_MISSING'
  | 'ADJUDICATED_PROJECTION_STATE_MISSING'
  | 'UNADJUDICATED_CASES_PRESENT';

export interface WorksheetReviewRouteEvaluationReadinessPolicyV1 {
  minimumAdjudicatedCases: number;
  minimumAdjudicatedCaseFamilies: number;
  requireBothExpectedRoutes: boolean;
  requireProjectionForAllAdjudicated: boolean;
  requireAllCasesAdjudicated: boolean;
}

export interface WorksheetReviewRouteCorpusSummaryV1 {
  cases: number;
  caseFamilies: number;
  zeroAnnotationCases: number;
  oneAnnotationCases: number;
  multiAnnotationPendingAdjudicationCases: number;
  adjudicatedCases: number;
  adjudicatedCaseFamilies: number;
  annotations: number;
  projectionStateCases: number;
  adjudicatedProjectionStateCases: number;
  expectedInspectCases: number;
  expectedRoutineCases: number;
  adjudicationCoverage: number;
  projectionCoverage: number;
  adjudicatedProjectionCoverage: number;
}

export interface WorksheetReviewRouteReadinessBlockerV1 {
  code: WorksheetReviewRouteReadinessBlockerCode;
  actual: number | boolean;
  required: number | boolean;
}

export interface WorksheetReviewRouteEvaluationReadinessV1 {
  ready: boolean;
  policy: WorksheetReviewRouteEvaluationReadinessPolicyV1;
  summary: WorksheetReviewRouteCorpusSummaryV1;
  blockers: readonly WorksheetReviewRouteReadinessBlockerV1[];
}

const POLICY_KEYS = [
  'minimumAdjudicatedCases',
  'minimumAdjudicatedCaseFamilies',
  'requireBothExpectedRoutes',
  'requireProjectionForAllAdjudicated',
  'requireAllCasesAdjudicated',
] as const;

export function summarizeWorksheetReviewRouteCorpus(
  corpus: WorksheetReviewRouteLabelCorpusV1,
): WorksheetReviewRouteCorpusSummaryV1 {
  assertWorksheetReviewRouteLabelCorpus(corpus);

  const familySet = new Set<string>();
  const adjudicatedFamilySet = new Set<string>();

  let zeroAnnotationCases = 0;
  let oneAnnotationCases = 0;
  let multiAnnotationPendingAdjudicationCases = 0;
  let adjudicatedCases = 0;
  let annotations = 0;
  let projectionStateCases = 0;
  let adjudicatedProjectionStateCases = 0;
  let expectedInspectCases = 0;
  let expectedRoutineCases = 0;

  for (const entry of corpus.cases) {
    familySet.add(entry.evidence.caseFamily);
    annotations += entry.annotations.length;

    if (entry.projectionState !== undefined) {
      projectionStateCases += 1;
    }

    if (entry.adjudication === undefined) {
      if (entry.annotations.length === 0) {
        zeroAnnotationCases += 1;
      } else if (entry.annotations.length === 1) {
        oneAnnotationCases += 1;
      } else {
        multiAnnotationPendingAdjudicationCases += 1;
      }
      continue;
    }

    adjudicatedCases += 1;
    adjudicatedFamilySet.add(entry.evidence.caseFamily);
    if (entry.projectionState !== undefined) {
      adjudicatedProjectionStateCases += 1;
    }
    if (entry.adjudication.route === 'inspect') {
      expectedInspectCases += 1;
    } else {
      expectedRoutineCases += 1;
    }
  }

  return {
    cases: corpus.cases.length,
    caseFamilies: familySet.size,
    zeroAnnotationCases,
    oneAnnotationCases,
    multiAnnotationPendingAdjudicationCases,
    adjudicatedCases,
    adjudicatedCaseFamilies: adjudicatedFamilySet.size,
    annotations,
    projectionStateCases,
    adjudicatedProjectionStateCases,
    expectedInspectCases,
    expectedRoutineCases,
    adjudicationCoverage: ratio(
      adjudicatedCases,
      corpus.cases.length,
    ),
    projectionCoverage: ratio(
      projectionStateCases,
      corpus.cases.length,
    ),
    adjudicatedProjectionCoverage: ratio(
      adjudicatedProjectionStateCases,
      adjudicatedCases,
    ),
  };
}

export function evaluateWorksheetReviewRouteReadiness(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  policy: WorksheetReviewRouteEvaluationReadinessPolicyV1,
): WorksheetReviewRouteEvaluationReadinessV1 {
  assertWorksheetReviewRouteReadinessPolicy(policy);
  const summary = summarizeWorksheetReviewRouteCorpus(corpus);
  const blockers: WorksheetReviewRouteReadinessBlockerV1[] = [];

  if (
    summary.adjudicatedCases
    < policy.minimumAdjudicatedCases
  ) {
    blockers.push({
      code: 'ADJUDICATED_CASES_BELOW_MINIMUM',
      actual: summary.adjudicatedCases,
      required: policy.minimumAdjudicatedCases,
    });
  }

  if (
    summary.adjudicatedCaseFamilies
    < policy.minimumAdjudicatedCaseFamilies
  ) {
    blockers.push({
      code: 'ADJUDICATED_CASE_FAMILIES_BELOW_MINIMUM',
      actual: summary.adjudicatedCaseFamilies,
      required: policy.minimumAdjudicatedCaseFamilies,
    });
  }

  if (
    policy.requireBothExpectedRoutes
    && (
      summary.expectedInspectCases === 0
      || summary.expectedRoutineCases === 0
    )
  ) {
    blockers.push({
      code: 'EXPECTED_ROUTE_CLASS_MISSING',
      actual:
        summary.expectedInspectCases > 0
        && summary.expectedRoutineCases > 0,
      required: true,
    });
  }

  if (
    policy.requireProjectionForAllAdjudicated
    && summary.adjudicatedProjectionStateCases
      !== summary.adjudicatedCases
  ) {
    blockers.push({
      code: 'ADJUDICATED_PROJECTION_STATE_MISSING',
      actual: summary.adjudicatedProjectionStateCases,
      required: summary.adjudicatedCases,
    });
  }

  if (
    policy.requireAllCasesAdjudicated
    && summary.adjudicatedCases !== summary.cases
  ) {
    blockers.push({
      code: 'UNADJUDICATED_CASES_PRESENT',
      actual: summary.adjudicatedCases,
      required: summary.cases,
    });
  }

  return {
    ready: blockers.length === 0,
    policy: { ...policy },
    summary,
    blockers,
  };
}

export function assertWorksheetReviewRouteReadinessPolicy(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationReadinessPolicyV1 {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      'Worksheet review-route readiness policy must be an object.',
    );
  }

  const policy = value as Record<string, unknown>;
  const allowed = new Set<string>(POLICY_KEYS);

  for (const key of Object.keys(policy)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Unknown worksheet review-route readiness policy field: ${key}.`,
      );
    }
  }

  for (const key of POLICY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(policy, key)) {
      throw new Error(
        `Missing worksheet review-route readiness policy field: ${key}.`,
      );
    }
  }

  assertPositiveInteger(
    'minimumAdjudicatedCases',
    policy.minimumAdjudicatedCases,
  );
  assertPositiveInteger(
    'minimumAdjudicatedCaseFamilies',
    policy.minimumAdjudicatedCaseFamilies,
  );

  for (const key of [
    'requireBothExpectedRoutes',
    'requireProjectionForAllAdjudicated',
    'requireAllCasesAdjudicated',
  ] as const) {
    if (typeof policy[key] !== 'boolean') {
      throw new Error(
        `Worksheet review-route readiness policy ${key} must be boolean.`,
      );
    }
  }
}

function assertPositiveInteger(
  name: string,
  value: unknown,
): asserts value is number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 1
  ) {
    throw new Error(
      `Worksheet review-route readiness policy ${name} must be an integer >= 1.`,
    );
  }
}

function ratio(
  numerator: number,
  denominator: number,
): number {
  if (denominator === 0) return 0;
  return round(numerator / denominator);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
