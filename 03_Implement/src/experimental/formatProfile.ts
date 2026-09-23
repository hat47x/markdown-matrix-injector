import { normalizeFormatFeatures } from './flyInspiredFormatMatcher.js';
import {
  WORKSHEET_FORMAT_FEATURE_VERSION,
  type WorksheetFormatEvidenceKind,
  type WorksheetFormatPrototype,
  type WorksheetFormatSourceProfile,
} from './worksheetFormatPrototype.js';

export const FORMAT_PROFILE_SCHEMA_VERSION = 'mmi-format-profile-v1' as const;

export type FormatProfileStatus = 'candidate' | 'approved';

export interface FormatProfileProvenance {
  sourceKind: string;
  sourceDigest: string;
  generationMethod: 'worksheet-prototype-v1';
}

export interface FormatProfileHumanApproval {
  kind: 'human';
  approvedBy: string;
  approvalReference: string;
  approvedAt?: string;
}

export interface FormatProfileV1 {
  schemaVersion: typeof FORMAT_PROFILE_SCHEMA_VERSION;
  id: string;
  label: string;
  purpose: string;
  status: FormatProfileStatus;
  featureVersion: string;
  sourceProfileId: string;
  sourceEvidence: readonly WorksheetFormatEvidenceKind[];
  features: readonly string[];
  provenance: FormatProfileProvenance;
  approval?: FormatProfileHumanApproval;
}

export interface CreateFormatProfileCandidateInput {
  id: string;
  label: string;
  purpose: string;
  prototype: WorksheetFormatPrototype;
  sourceKind: string;
  sourceDigest: string;
}

export interface ApproveFormatProfileInput {
  approvedBy: string;
  approvalReference: string;
  approvedAt?: string;
}

export function createFormatProfileCandidate(
  input: CreateFormatProfileCandidateInput,
): FormatProfileV1 {
  assertNonEmpty('profile.id', input.id);
  assertStableId(input.id);
  assertNonEmpty('profile.label', input.label);
  assertNonEmpty('profile.purpose', input.purpose);
  assertNonEmpty('profile.sourceKind', input.sourceKind);
  assertNonEmpty('profile.sourceDigest', input.sourceDigest);

  const profile: FormatProfileV1 = {
    schemaVersion: FORMAT_PROFILE_SCHEMA_VERSION,
    id: input.id,
    label: input.label.trim(),
    purpose: input.purpose.trim(),
    status: 'candidate',
    featureVersion: input.prototype.featureVersion,
    sourceProfileId: input.prototype.sourceProfileId,
    sourceEvidence: [...input.prototype.sourceEvidence],
    features: normalizeFormatFeatures(input.prototype.features),
    provenance: {
      sourceKind: input.sourceKind.trim(),
      sourceDigest: input.sourceDigest.trim(),
      generationMethod: 'worksheet-prototype-v1',
    },
  };

  assertFormatProfile(profile);
  return profile;
}

export function approveFormatProfile(
  candidate: FormatProfileV1,
  approval: ApproveFormatProfileInput,
): FormatProfileV1 {
  assertFormatProfile(candidate);
  if (candidate.status !== 'candidate') {
    throw new Error('Only a candidate Format Profile can be approved.');
  }
  assertNonEmpty('approval.approvedBy', approval.approvedBy);
  assertNonEmpty('approval.approvalReference', approval.approvalReference);
  if (approval.approvedAt !== undefined) {
    assertNonEmpty('approval.approvedAt', approval.approvedAt);
  }

  const approved: FormatProfileV1 = {
    ...candidate,
    sourceEvidence: [...candidate.sourceEvidence],
    features: [...candidate.features],
    provenance: { ...candidate.provenance },
    status: 'approved',
    approval: {
      kind: 'human',
      approvedBy: approval.approvedBy.trim(),
      approvalReference: approval.approvalReference.trim(),
      ...(approval.approvedAt === undefined
        ? {}
        : { approvedAt: approval.approvedAt.trim() }),
    },
  };

  assertFormatProfile(approved);
  return approved;
}

export function assertFormatProfile(profile: FormatProfileV1): void {
  if (profile.schemaVersion !== FORMAT_PROFILE_SCHEMA_VERSION) {
    throw new Error(`Unsupported Format Profile schema version: ${String(profile.schemaVersion)}.`);
  }
  assertNonEmpty('profile.id', profile.id);
  assertStableId(profile.id);
  assertNonEmpty('profile.label', profile.label);
  assertNonEmpty('profile.purpose', profile.purpose);
  if (!['candidate', 'approved'].includes(profile.status)) {
    throw new Error(`Unsupported Format Profile status: ${String(profile.status)}.`);
  }
  assertNonEmpty('profile.featureVersion', profile.featureVersion);
  assertNonEmpty('profile.sourceProfileId', profile.sourceProfileId);
  assertEvidence(profile.sourceEvidence);

  if (profile.features.length === 0) {
    throw new Error('Format Profile must contain at least one canonical feature.');
  }
  const normalizedFeatures = normalizeFormatFeatures(profile.features);
  if (!sameStrings(profile.features, normalizedFeatures)) {
    throw new Error('Format Profile features must be normalized, unique, and sorted.');
  }

  assertNonEmpty('profile.provenance.sourceKind', profile.provenance.sourceKind);
  assertNonEmpty('profile.provenance.sourceDigest', profile.provenance.sourceDigest);
  if (profile.provenance.generationMethod !== 'worksheet-prototype-v1') {
    throw new Error('Unsupported Format Profile generation method.');
  }

  if (profile.status === 'candidate') {
    if (profile.approval !== undefined) {
      throw new Error('Candidate Format Profile must not contain approval metadata.');
    }
    return;
  }

  if (profile.approval === undefined || profile.approval.kind !== 'human') {
    throw new Error('Approved Format Profile requires explicit human approval metadata.');
  }
  assertNonEmpty('profile.approval.approvedBy', profile.approval.approvedBy);
  assertNonEmpty('profile.approval.approvalReference', profile.approval.approvalReference);
  if (profile.approval.approvedAt !== undefined) {
    assertNonEmpty('profile.approval.approvedAt', profile.approval.approvedAt);
  }
}

export function assertFormatProfileCompatible(
  profile: FormatProfileV1,
  sourceProfile: WorksheetFormatSourceProfile,
): void {
  assertFormatProfile(profile);

  if (profile.featureVersion !== WORKSHEET_FORMAT_FEATURE_VERSION) {
    throw new Error(
      `Incompatible Format Profile feature version: ${profile.featureVersion} != ${WORKSHEET_FORMAT_FEATURE_VERSION}.`,
    );
  }

  if (
    profile.sourceProfileId !== sourceProfile.id
    || !sameStrings(
      [...profile.sourceEvidence].sort(),
      [...new Set(sourceProfile.evidence)].sort(),
    )
  ) {
    throw new Error('Incompatible Format Profile source profile or evidence contract.');
  }
}

export function formatProfileToWorksheetPrototype(
  profile: FormatProfileV1,
  sourceProfile: WorksheetFormatSourceProfile,
): WorksheetFormatPrototype {
  assertFormatProfileCompatible(profile, sourceProfile);
  if (profile.status !== 'approved') {
    throw new Error('Only an approved Format Profile can become a matcher prototype.');
  }

  return {
    id: profile.id,
    features: [...profile.features],
    featureVersion: WORKSHEET_FORMAT_FEATURE_VERSION,
    sourceProfileId: profile.sourceProfileId,
    sourceEvidence: [...profile.sourceEvidence],
  };
}

function assertEvidence(evidence: readonly WorksheetFormatEvidenceKind[]): void {
  if (evidence.length === 0) {
    throw new Error('Format Profile must declare at least one source evidence kind.');
  }
  const allowed = new Set<WorksheetFormatEvidenceKind>(['structure', 'fill', 'border']);
  const seen = new Set<WorksheetFormatEvidenceKind>();
  for (const value of evidence) {
    if (!allowed.has(value)) {
      throw new Error(`Unsupported Format Profile evidence kind: ${String(value)}.`);
    }
    if (seen.has(value)) {
      throw new Error(`Duplicate Format Profile evidence kind: ${value}.`);
    }
    seen.add(value);
  }
}

function assertStableId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error('Format Profile id must be a stable ASCII identifier.');
  }
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
