import { createHash } from 'node:crypto';
import {
  assertStructuredArtifactObservation,
  type StructuredArtifactObservationV0,
} from './structuredArtifactNeutralObservation.js';
import {
  deriveMmiStructuredArtifactBodyCandidateSignal,
  MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
  STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS,
} from './structuredArtifactBodyCandidateSignal.js';
import {
  createMmiWorksheetStructuredArtifactObservation,
  MMI_WORKSHEET_NEUTRAL_MERGE_METHOD,
  MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD,
  MMI_WORKSHEET_NEUTRAL_PRODUCER_SCHEMA,
  type MmiWorksheetNeutralObservationInput,
} from './mmiWorksheetStructuredArtifactNeutralAdapter.js';

export const MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_VERSION =
  'mmi-structured-artifact-sai1-portable-adapter-v0' as const;

export const MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_CONFIG_DIGEST =
  sha256(JSON.stringify([
    'sai1-adapter-config/v0',
    MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_VERSION,
    MMI_WORKSHEET_NEUTRAL_PRODUCER_SCHEMA,
    MMI_WORKSHEET_NEUTRAL_NON_EMPTY_METHOD,
    MMI_WORKSHEET_NEUTRAL_MERGE_METHOD,
    STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS,
    MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
    'role.header_candidate_signal:excluded',
  ]));

export function createMmiWorksheetStructuredArtifactSai1Observation(
  input: MmiWorksheetNeutralObservationInput,
): StructuredArtifactObservationV0 {
  const base =
    createMmiWorksheetStructuredArtifactObservation(input);
  const features = {...base.features};

  delete features['role.header_candidate_signal'];
  features['role.body_candidate_signal'] =
    deriveMmiStructuredArtifactBodyCandidateSignal(
      input.snapshot,
    );

  const observation: StructuredArtifactObservationV0 = {
    ...base,
    producer: {
      ...base.producer,
      adapter_version:
        MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_VERSION,
    },
    features,
    provenance: {
      ...base.provenance,
      adapter_config_digest:
        MMI_WORKSHEET_SAI1_PORTABLE_ADAPTER_CONFIG_DIGEST,
    },
  };

  assertStructuredArtifactObservation(observation);
  return observation;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')}`;
}
