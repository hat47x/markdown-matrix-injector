import { createHash } from 'node:crypto';
import {
  assertCognitiveProviderDescriptor,
  type CognitiveProviderDescriptor,
} from './cognitiveContract.js';
import type {
  ClosedChoiceJudgmentProvider,
} from './closedChoiceJudgmentProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_QUESTION,
  type WorksheetReviewRouteChoice,
} from './jevWorksheetReviewRouteProvider.js';
import {
  WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
  type WorksheetReviewRouteLabelCorpusV1,
} from './worksheetReviewRouteLabelCorpus.js';
import {
  createWorksheetReviewRouteEvaluationPacket,
} from './worksheetReviewRouteEvaluationPacket.js';
import {
  runWorksheetReviewRouteEvaluation,
  type RunWorksheetReviewRouteEvaluationOptions,
  type WorksheetReviewRouteEvaluationRunResultV1,
} from './worksheetReviewRouteEvaluationRunner.js';
import {
  assertWorksheetReviewRouteReadinessPolicy,
  evaluateWorksheetReviewRouteReadiness,
  type WorksheetReviewRouteEvaluationReadinessPolicyV1,
  type WorksheetReviewRouteEvaluationReadinessV1,
} from './worksheetReviewRouteReadiness.js';

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_SCHEMA_VERSION =
  'mmi-worksheet-review-route-evaluation-plan-v1' as const;

export const WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_REPRESENTATION =
  'worksheet-review-route-evaluation-plan-v1' as const;

export interface WorksheetReviewRouteEvaluationPlanV1 {
  schemaVersion:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_SCHEMA_VERSION;
  protocolVersion:
    typeof WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION;
  representation:
    typeof WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_REPRESENTATION;
  purpose: 'predeclared-provider-evaluation';
  packetDigest: string;
  readinessPolicy:
    WorksheetReviewRouteEvaluationReadinessPolicyV1;
  provider: CognitiveProviderDescriptor;
  planDigest: string;
}

export type WorksheetReviewRoutePlannedRunResultV1 =
  | {
      status: 'blocked';
      planDigest: string;
      readiness: WorksheetReviewRouteEvaluationReadinessV1;
    }
  | {
      status: 'completed';
      planDigest: string;
      run: Extract<
        WorksheetReviewRouteEvaluationRunResultV1,
        { status: 'completed' }
      >;
    };

const PLAN_KEYS = [
  'schemaVersion',
  'protocolVersion',
  'representation',
  'purpose',
  'packetDigest',
  'readinessPolicy',
  'provider',
  'planDigest',
] as const;

export function createWorksheetReviewRouteEvaluationPlan(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  readinessPolicy:
    WorksheetReviewRouteEvaluationReadinessPolicyV1,
  provider: CognitiveProviderDescriptor,
): WorksheetReviewRouteEvaluationPlanV1 {
  assertWorksheetReviewRouteReadinessPolicy(
    readinessPolicy,
  );
  assertEvaluationPolicy(readinessPolicy);

  const readiness =
    evaluateWorksheetReviewRouteReadiness(
      corpus,
      readinessPolicy,
    );
  if (!readiness.ready) {
    throw new Error(
      'Worksheet review-route evaluation plan requires a ready corpus.',
    );
  }

  const canonicalProvider =
    canonicalizeProvider(provider);
  assertEvaluationProvider(canonicalProvider);

  const packet =
    createWorksheetReviewRouteEvaluationPacket(corpus);

  const base = {
    schemaVersion:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_SCHEMA_VERSION,
    protocolVersion:
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    representation:
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_REPRESENTATION,
    purpose: 'predeclared-provider-evaluation' as const,
    packetDigest: packet.packetDigest,
    readinessPolicy: { ...readinessPolicy },
    provider: canonicalProvider,
  };

  return {
    ...base,
    planDigest: createPlanDigest(
      base.packetDigest,
      base.readinessPolicy,
      base.provider,
    ),
  };
}

export function assertWorksheetReviewRouteEvaluationPlan(
  value: unknown,
): asserts value is WorksheetReviewRouteEvaluationPlanV1 {
  const plan = requireRecord(
    value,
    'worksheet review-route evaluation plan',
  );
  assertExactKeys(plan, PLAN_KEYS, 'evaluation plan');

  if (
    plan.schemaVersion !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_SCHEMA_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route evaluation plan schema version.',
    );
  }
  if (
    plan.protocolVersion !==
      WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION
  ) {
    throw new Error(
      'Unsupported worksheet review-route evaluation plan protocol version.',
    );
  }
  if (
    plan.representation !==
      WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_REPRESENTATION
    || plan.purpose !==
      'predeclared-provider-evaluation'
  ) {
    throw new Error(
      'Invalid worksheet review-route evaluation plan identity.',
    );
  }

  assertDigest(plan.packetDigest);
  assertDigest(plan.planDigest);
  assertWorksheetReviewRouteReadinessPolicy(
    plan.readinessPolicy,
  );
  assertEvaluationPolicy(plan.readinessPolicy);

  const canonicalProvider =
    canonicalizeProvider(
      plan.provider as CognitiveProviderDescriptor,
    );
  assertEvaluationProvider(canonicalProvider);
  if (
    !sameStrings(
      canonicalProvider.capabilities,
      (plan.provider as CognitiveProviderDescriptor).capabilities,
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation plan provider must use canonical capability order.',
    );
  }

  const expectedDigest = createPlanDigest(
    plan.packetDigest,
    plan.readinessPolicy,
    canonicalProvider,
  );
  if (plan.planDigest !== expectedDigest) {
    throw new Error(
      'Worksheet review-route evaluation plan digest does not match its contents.',
    );
  }
}

export async function runWorksheetReviewRouteEvaluationPlan(
  corpus: WorksheetReviewRouteLabelCorpusV1,
  plan: WorksheetReviewRouteEvaluationPlanV1,
  provider:
    ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice>,
  options: RunWorksheetReviewRouteEvaluationOptions = {},
): Promise<WorksheetReviewRoutePlannedRunResultV1> {
  assertWorksheetReviewRouteEvaluationPlan(plan);

  const runtimeProvider =
    canonicalizeProvider(provider.descriptor);
  assertEvaluationProvider(runtimeProvider);
  if (!sameProvider(plan.provider, runtimeProvider)) {
    throw new Error(
      'Worksheet review-route evaluation runtime provider does not match the predeclared plan.',
    );
  }

  const readiness =
    evaluateWorksheetReviewRouteReadiness(
      corpus,
      plan.readinessPolicy,
    );
  if (!readiness.ready) {
    return {
      status: 'blocked',
      planDigest: plan.planDigest,
      readiness,
    };
  }

  const packet =
    createWorksheetReviewRouteEvaluationPacket(corpus);
  if (packet.packetDigest !== plan.packetDigest) {
    throw new Error(
      'Worksheet review-route evaluation plan is stale for the current provider-visible packet.',
    );
  }

  const run =
    await runWorksheetReviewRouteEvaluation(
      corpus,
      plan.readinessPolicy,
      provider,
      options,
    );

  if (run.status !== 'completed') {
    return {
      status: 'blocked',
      planDigest: plan.planDigest,
      readiness: run.readiness,
    };
  }

  return {
    status: 'completed',
    planDigest: plan.planDigest,
    run,
  };
}

function canonicalizeProvider(
  provider: CognitiveProviderDescriptor,
): CognitiveProviderDescriptor {
  const snapshot: CognitiveProviderDescriptor = {
    id: provider.id,
    version: provider.version,
    category: provider.category,
    executionBoundary: provider.executionBoundary,
    capabilities: [...provider.capabilities].sort(),
  };
  assertCognitiveProviderDescriptor(snapshot);
  return snapshot;
}

function assertEvaluationProvider(
  provider: CognitiveProviderDescriptor,
): void {
  if (
    provider.category !== 'judgment'
    || !provider.capabilities.includes(
      'closed-choice',
    )
  ) {
    throw new Error(
      'Worksheet review-route evaluation plan requires a judgment provider with closed-choice capability.',
    );
  }
}

function assertEvaluationPolicy(
  policy:
    WorksheetReviewRouteEvaluationReadinessPolicyV1,
): void {
  if (
    policy.requireProjectionForAllAdjudicated
      !== true
  ) {
    throw new Error(
      'Worksheet review-route evaluation plan requires requireProjectionForAllAdjudicated=true.',
    );
  }
}

function createPlanDigest(
  packetDigest: string,
  policy:
    WorksheetReviewRouteEvaluationReadinessPolicyV1,
  provider: CognitiveProviderDescriptor,
): string {
  const canonical = JSON.stringify([
    WORKSHEET_REVIEW_ROUTE_EVALUATION_PLAN_REPRESENTATION,
    WORKSHEET_REVIEW_ROUTE_LABELING_PROTOCOL_VERSION,
    packetDigest,
    [
      policy.minimumAdjudicatedCases,
      policy.minimumAdjudicatedCaseFamilies,
      policy.requireBothExpectedRoutes,
      policy.requireProjectionForAllAdjudicated,
      policy.requireAllCasesAdjudicated,
    ],
    [
      provider.id,
      provider.version,
      provider.category,
      provider.executionBoundary,
      [...provider.capabilities].sort(),
    ],
    WORKSHEET_REVIEW_ROUTE_QUESTION.id,
  ]);

  return `sha256:${createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex')}`;
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

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every(
      (value, index) => value === right[index],
    );
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

function assertDigest(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'Worksheet review-route evaluation plan digest fields must use sha256:<64 hex>.',
    );
  }
}
