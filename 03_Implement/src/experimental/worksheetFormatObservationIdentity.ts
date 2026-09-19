import { createHash } from 'node:crypto';
import {
  normalizeFormatFeatures,
} from './flyInspiredFormatMatcher.js';
import {
  extractWorksheetFormatFeatures,
  type WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';
import {
  filterWorksheetFormatFeaturesByEvidence,
  WORKSHEET_FORMAT_FEATURE_VERSION,
  type WorksheetFormatSnapshotMatch,
  type WorksheetFormatSourceProfile,
} from './worksheetFormatPrototype.js';

export const WORKSHEET_FORMAT_OBSERVATION_IDENTITY_SCHEMA_VERSION =
  'mmi-worksheet-format-observation-identity-v1' as const;

export const WORKSHEET_FORMAT_OBSERVATION_IDENTITY_ALGORITHM =
  'sha256' as const;

export const WORKSHEET_FORMAT_OBSERVATION_IDENTITY_REPRESENTATION =
  'worksheet-format-compared-features-v1' as const;

export interface WorksheetFormatObservationIdentityV1 {
  schemaVersion:
    typeof WORKSHEET_FORMAT_OBSERVATION_IDENTITY_SCHEMA_VERSION;
  role: 'worksheet-format-observation-identity';
  algorithm: typeof WORKSHEET_FORMAT_OBSERVATION_IDENTITY_ALGORITHM;
  representation:
    typeof WORKSHEET_FORMAT_OBSERVATION_IDENTITY_REPRESENTATION;
  digest: string;
  sourceDigest: string;
  featureVersion: string;
  sourceProfileId: string;
  sourceEvidence: readonly string[];
}

/**
 * Creates an identity for the exact derived format state used by the worksheet
 * matcher. Raw cells and raw feature strings are not retained in the artifact.
 *
 * This is not a source-file identity. It is a derived-state binding for
 * Perception/review orchestration.
 */
export function createWorksheetFormatObservationIdentityFromMatch(
  sourceDigest: string,
  result: WorksheetFormatSnapshotMatch,
): WorksheetFormatObservationIdentityV1 {
  return createIdentity(
    sourceDigest,
    result.featureVersion,
    result.sourceProfileId,
    result.sourceEvidence,
    result.comparedFeatures,
  );
}

/**
 * Recomputes the same derived-state identity directly from a worksheet
 * snapshot and source profile.
 */
export function createWorksheetFormatObservationIdentityFromSnapshot(
  sourceDigest: string,
  snapshot: WorksheetFormatSnapshot,
  sourceProfile: WorksheetFormatSourceProfile,
): WorksheetFormatObservationIdentityV1 {
  assertSourceProfile(sourceProfile);

  const observation = extractWorksheetFormatFeatures(snapshot);
  const comparedFeatures = filterWorksheetFormatFeaturesByEvidence(
    observation.features,
    sourceProfile.evidence,
  );

  return createIdentity(
    sourceDigest,
    WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfile.id,
    sourceProfile.evidence,
    comparedFeatures,
  );
}

export function assertWorksheetFormatObservationIdentityMatchesSnapshot(
  identity: WorksheetFormatObservationIdentityV1,
  sourceDigest: string,
  snapshot: WorksheetFormatSnapshot,
  sourceProfile: WorksheetFormatSourceProfile,
): void {
  const expected = createWorksheetFormatObservationIdentityFromSnapshot(
    sourceDigest,
    snapshot,
    sourceProfile,
  );

  if (!sameIdentity(identity, expected)) {
    throw new Error(
      'Worksheet format observation identity does not match the supplied snapshot and provenance.',
    );
  }
}

function createIdentity(
  sourceDigest: string,
  featureVersion: string,
  sourceProfileId: string,
  sourceEvidence: readonly string[],
  features: readonly string[],
): WorksheetFormatObservationIdentityV1 {
  assertNonEmpty('source digest', sourceDigest);
  assertNonEmpty('feature version', featureVersion);
  assertNonEmpty('source profile id', sourceProfileId);

  const evidence = normalizeStrings(sourceEvidence);
  if (evidence.length === 0) {
    throw new Error(
      'Worksheet format observation identity requires source evidence.',
    );
  }

  const normalizedFeatures = normalizeFormatFeatures(features);
  const canonical = JSON.stringify([
    WORKSHEET_FORMAT_OBSERVATION_IDENTITY_REPRESENTATION,
    sourceDigest,
    featureVersion,
    sourceProfileId,
    evidence,
    normalizedFeatures,
  ]);
  const digest = createHash(
    WORKSHEET_FORMAT_OBSERVATION_IDENTITY_ALGORITHM,
  )
    .update(canonical, 'utf8')
    .digest('hex');

  return {
    schemaVersion: WORKSHEET_FORMAT_OBSERVATION_IDENTITY_SCHEMA_VERSION,
    role: 'worksheet-format-observation-identity',
    algorithm: WORKSHEET_FORMAT_OBSERVATION_IDENTITY_ALGORITHM,
    representation:
      WORKSHEET_FORMAT_OBSERVATION_IDENTITY_REPRESENTATION,
    digest:
      `${WORKSHEET_FORMAT_OBSERVATION_IDENTITY_ALGORITHM}:${digest}`,
    sourceDigest,
    featureVersion,
    sourceProfileId,
    sourceEvidence: evidence,
  };
}

function sameIdentity(
  left: WorksheetFormatObservationIdentityV1,
  right: WorksheetFormatObservationIdentityV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.role === right.role
    && left.algorithm === right.algorithm
    && left.representation === right.representation
    && left.digest === right.digest
    && left.sourceDigest === right.sourceDigest
    && left.featureVersion === right.featureVersion
    && left.sourceProfileId === right.sourceProfileId
    && sameStrings(left.sourceEvidence, right.sourceEvidence);
}

function normalizeStrings(values: readonly string[]): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()))]
    .filter((value) => value.length > 0)
    .sort();

  return normalized;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function assertSourceProfile(
  sourceProfile: WorksheetFormatSourceProfile,
): void {
  assertNonEmpty('source profile id', sourceProfile.id);
  if (sourceProfile.evidence.length === 0) {
    throw new Error(
      'Worksheet format observation identity requires source profile evidence.',
    );
  }
}

function assertNonEmpty(
  label: string,
  value: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `Worksheet format observation identity ${label} must not be empty.`,
    );
  }
}
