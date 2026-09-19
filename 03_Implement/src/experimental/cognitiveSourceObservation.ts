import {
  readSourceFileIdentity,
  resolveContainedSourceIdentity,
  type SourceIdentityV1,
} from '../core/sourceIdentity.js';
import {
  assertCognitiveObservation,
  type CognitiveObservation,
} from './cognitiveContract.js';

export interface ContainedCognitiveObservationInput {
  id: string;
  kind: string;
  schemaVersion: string;
  sourceKind: string;
  markdownFilePath: string;
  sourcePath: string;
  workspaceRoot?: string;
  featureVersion?: string;
  sourceProfileId?: string;
}

export interface ContainedCognitiveObservationResult<TPayload> {
  observation: CognitiveObservation<TPayload>;
  resolvedPath: string;
  sourceIdentity: SourceIdentityV1;
}

export class SourceChangedDuringCognitiveObservationError extends Error {
  constructor(
    before: SourceIdentityV1,
    after: SourceIdentityV1,
  ) {
    super(
      `Source changed while creating Cognitive Observation: ${before.digest} -> ${after.digest}.`,
    );
    this.name = 'SourceChangedDuringCognitiveObservationError';
  }
}

export function createContainedCognitiveObservation<TPayload>(
  input: ContainedCognitiveObservationInput,
  readPayload: (resolvedPath: string) => TPayload,
): ContainedCognitiveObservationResult<TPayload> {
  const resolved = resolveContainedSourceIdentity({
    markdownFilePath: input.markdownFilePath,
    sourcePath: input.sourcePath,
    ...(input.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: input.workspaceRoot }),
  });

  const payload = readPayload(resolved.resolvedPath);
  const after = readSourceFileIdentity(resolved.resolvedPath);

  if (
    after.digest !== resolved.identity.digest
    || after.byteLength !== resolved.identity.byteLength
  ) {
    throw new SourceChangedDuringCognitiveObservationError(
      resolved.identity,
      after,
    );
  }

  const observation: CognitiveObservation<TPayload> = {
    id: input.id,
    kind: input.kind,
    schemaVersion: input.schemaVersion,
    payload,
    provenance: {
      sourceKind: input.sourceKind,
      sourceDigest: resolved.identity.digest,
      ...(input.featureVersion === undefined
        ? {}
        : { featureVersion: input.featureVersion }),
      ...(input.sourceProfileId === undefined
        ? {}
        : { sourceProfileId: input.sourceProfileId }),
    },
  };

  assertCognitiveObservation(observation);

  return {
    observation,
    resolvedPath: resolved.resolvedPath,
    sourceIdentity: { ...resolved.identity },
  };
}
