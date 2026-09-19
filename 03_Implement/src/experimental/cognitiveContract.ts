export type CognitiveProviderCategory =
  | 'perception'
  | 'judgment'
  | 'reasoning-generation';

export type CognitiveOutcomeStatus =
  | 'signal'
  | 'abstained'
  | 'unsupported'
  | 'unavailable'
  | 'error';

export type CognitiveExecutionBoundary = 'local' | 'external-opt-in';

export interface CognitiveProviderDescriptor {
  id: string;
  version: string;
  category: CognitiveProviderCategory;
  executionBoundary: CognitiveExecutionBoundary;
  capabilities: readonly string[];
}

export interface CognitiveObservationProvenance {
  sourceKind: string;
  sourceDigest: string;
  featureVersion?: string;
  sourceProfileId?: string;
}

export interface CognitiveObservation<TPayload = unknown> {
  id: string;
  kind: string;
  schemaVersion: string;
  payload: TPayload;
  provenance: CognitiveObservationProvenance;
}

export interface CognitiveObservationRef {
  id: string;
  sourceDigest: string;
  schemaVersion: string;
}

export interface CognitiveScoreRange {
  min: number;
  max: number;
}

export interface CognitiveScore {
  namespace: string;
  name: string;
  semantics: string;
  value: number;
  range?: CognitiveScoreRange;
  higherIsStronger?: boolean;
}

export interface CognitiveEvidence {
  code: string;
  detail?: string;
}

export interface CognitiveSignal<TPayload = unknown> {
  kind: string;
  payload: TPayload;
  scores?: readonly CognitiveScore[];
  evidence?: readonly CognitiveEvidence[];
}

interface CognitiveOutcomeBase {
  provider: CognitiveProviderDescriptor;
  observation: CognitiveObservationRef;
}

export interface CognitiveSignalOutcome<TPayload = unknown>
  extends CognitiveOutcomeBase {
  status: 'signal';
  signal: CognitiveSignal<TPayload>;
}

export interface CognitiveAbstentionOutcome
  extends CognitiveOutcomeBase {
  status: Exclude<CognitiveOutcomeStatus, 'signal'>;
  reasonCode: string;
  detail?: string;
  scores?: readonly CognitiveScore[];
}

export type CognitiveOutcome<TPayload = unknown> =
  | CognitiveSignalOutcome<TPayload>
  | CognitiveAbstentionOutcome;

export function toCognitiveObservationRef(
  observation: CognitiveObservation,
): CognitiveObservationRef {
  assertCognitiveObservation(observation);
  return {
    id: observation.id,
    sourceDigest: observation.provenance.sourceDigest,
    schemaVersion: observation.schemaVersion,
  };
}

export function assertCognitiveProviderDescriptor(
  provider: CognitiveProviderDescriptor,
): void {
  assertNonEmpty('provider.id', provider.id);
  assertNonEmpty('provider.version', provider.version);

  if (!['perception', 'judgment', 'reasoning-generation'].includes(provider.category)) {
    throw new Error(`Unsupported cognitive provider category: ${String(provider.category)}.`);
  }
  if (!['local', 'external-opt-in'].includes(provider.executionBoundary)) {
    throw new Error(`Unsupported cognitive execution boundary: ${String(provider.executionBoundary)}.`);
  }
  if (provider.capabilities.length === 0) {
    throw new Error('Cognitive provider must declare at least one capability.');
  }

  const seen = new Set<string>();
  for (const capability of provider.capabilities) {
    assertNonEmpty('provider capability', capability);
    if (seen.has(capability)) {
      throw new Error(`Duplicate cognitive provider capability: ${capability}.`);
    }
    seen.add(capability);
  }
}

export function assertCognitiveObservation(
  observation: CognitiveObservation,
): void {
  assertNonEmpty('observation.id', observation.id);
  assertNonEmpty('observation.kind', observation.kind);
  assertNonEmpty('observation.schemaVersion', observation.schemaVersion);
  assertNonEmpty('observation.provenance.sourceKind', observation.provenance.sourceKind);
  assertNonEmpty('observation.provenance.sourceDigest', observation.provenance.sourceDigest);

  if (observation.provenance.featureVersion !== undefined) {
    assertNonEmpty('observation.provenance.featureVersion', observation.provenance.featureVersion);
  }
  if (observation.provenance.sourceProfileId !== undefined) {
    assertNonEmpty('observation.provenance.sourceProfileId', observation.provenance.sourceProfileId);
  }
}

export function assertCognitiveScore(score: CognitiveScore): void {
  assertNonEmpty('score.namespace', score.namespace);
  assertNonEmpty('score.name', score.name);
  assertNonEmpty('score.semantics', score.semantics);

  if (!Number.isFinite(score.value)) {
    throw new Error('Cognitive score value must be finite.');
  }

  if (score.range !== undefined) {
    const { min, max } = score.range;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new Error('Cognitive score range must contain finite min < max.');
    }
    if (score.value < min || score.value > max) {
      throw new Error('Cognitive score value must fall within its declared range.');
    }
  }
}

export function assertCognitiveOutcome(
  outcome: CognitiveOutcome,
): void {
  if (!['signal', 'abstained', 'unsupported', 'unavailable', 'error'].includes(outcome.status)) {
    throw new Error(`Unsupported cognitive outcome status: ${String(outcome.status)}.`);
  }
  assertCognitiveProviderDescriptor(outcome.provider);
  assertNonEmpty('outcome.observation.id', outcome.observation.id);
  assertNonEmpty('outcome.observation.sourceDigest', outcome.observation.sourceDigest);
  assertNonEmpty('outcome.observation.schemaVersion', outcome.observation.schemaVersion);

  if (outcome.status === 'signal') {
    assertNonEmpty('signal.kind', outcome.signal.kind);
    for (const score of outcome.signal.scores ?? []) {
      assertCognitiveScore(score);
    }
    for (const evidence of outcome.signal.evidence ?? []) {
      assertNonEmpty('evidence.code', evidence.code);
      if (evidence.detail !== undefined) {
        assertNonEmpty('evidence.detail', evidence.detail);
      }
    }
    return;
  }

  assertNonEmpty('outcome.reasonCode', outcome.reasonCode);
  if (outcome.detail !== undefined) {
    assertNonEmpty('outcome.detail', outcome.detail);
  }
  for (const score of outcome.scores ?? []) {
    assertCognitiveScore(score);
  }
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
}
