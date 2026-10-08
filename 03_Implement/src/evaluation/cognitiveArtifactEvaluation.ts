import type {
  CognitiveArtifactManifestV0,
  CognitiveArtifactProvider,
  CognitiveArtifactResolution,
  CognitiveArtifactResolutionMetrics,
} from '../core/cognitiveArtifact.js';

export const COGNITIVE_ARTIFACT_EVALUATION_SCHEMA =
  'mmi.cognitive-artifact-evaluation/v0' as const;

export type CognitiveArtifactEvaluationState =
  | 'not-measured'
  | 'resolved'
  | 'unavailable'
  | 'download-required';

export interface CognitiveArtifactEvaluationObservation {
  schema: typeof COGNITIVE_ARTIFACT_EVALUATION_SCHEMA;
  state: CognitiveArtifactEvaluationState;
  artifact?: {
    id: string;
    kind: CognitiveArtifactManifestV0['kind'];
    version: string;
    sha256: string;
    sizeBytes: number;
    license: string;
  };
  provider?: CognitiveArtifactProvider;
  metrics?: CognitiveArtifactResolutionMetrics;
  resolution?: {
    status: CognitiveArtifactResolution['status'];
    sourceKind?: 'local-file' | 'https' | 'runtime-managed';
    locationKind?: 'cache' | 'local-file' | 'runtime-managed';
    reason?: string;
  };
  reason?: string;
}

export function cognitiveArtifactNotMeasured(
  reason: string,
): CognitiveArtifactEvaluationObservation {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error('cognitive artifact evaluation reason must not be empty');
  }
  return {
    schema: COGNITIVE_ARTIFACT_EVALUATION_SCHEMA,
    state: 'not-measured',
    reason: trimmed,
  };
}

export function cognitiveArtifactEvaluationObservation(
  manifest: CognitiveArtifactManifestV0,
  provider: CognitiveArtifactProvider,
  resolution: CognitiveArtifactResolution,
): CognitiveArtifactEvaluationObservation {
  const base = {
    schema: COGNITIVE_ARTIFACT_EVALUATION_SCHEMA,
    artifact: {
      id: manifest.artifactId,
      kind: manifest.kind,
      version: manifest.version,
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      license: manifest.license,
    },
    provider: { ...provider },
    metrics: { ...resolution.metrics },
  } as const;

  if (resolution.status === 'available') {
    return {
      ...base,
      state: 'resolved',
      resolution: {
        status: resolution.status,
        ...(resolution.source
          ? { sourceKind: resolution.source.kind }
          : {}),
        locationKind: resolution.location.kind,
      },
    };
  }

  if (resolution.status === 'download-required') {
    return {
      ...base,
      state: 'download-required',
      resolution: {
        status: resolution.status,
        sourceKind: resolution.source.kind,
      },
    };
  }

  return {
    ...base,
    state: 'unavailable',
    resolution: {
      status: resolution.status,
      reason: resolution.reason,
    },
  };
}
