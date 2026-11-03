/**
 * Read a TEI format profile projection artifact produced outside MMI.
 *
 * This module only validates the envelope and the flat profile fields. It does
 * not write profiles or change the format profile schema.
 */

export const ARTIFACT_SCHEMA = "tai.reference.tei-mmi-format-profile-projection/v0";

export interface ProjectionContract {
  id: string;
  version: string;
}

export interface ProjectionSource {
  teiCommit: string;
  contract: {
    contractId: string;
    contractVersion: string;
    contractDigest: string;
    sourceDigest: string;
    cases: number;
  };
}

export interface FormatProfile {
  schemaVersion: "mmi-format-profile-v1";
  id: string;
  label: string;
  purpose: string;
  status: "candidate" | "approved";
  featureVersion: string;
  sourceProfileId: string;
  features: string[];
  sourceEvidence: string[];
}

export interface FormatProfileProjection {
  schema: string;
  contract: ProjectionContract;
  source: ProjectionSource;
  profile: FormatProfile;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  return value.map((item, index) => requireString(item, `${field}[${index}]`));
}

export function parseFormatProfileProjection(value: unknown): FormatProfileProjection {
  if (typeof value !== "object" || value === null) {
    throw new Error("artifact must be an object");
  }
  const artifact = value as Record<string, unknown>;
  if (artifact.schema !== ARTIFACT_SCHEMA) {
    throw new Error(`schema must be ${ARTIFACT_SCHEMA}`);
  }
  const contract = artifact.contract as Record<string, unknown> | undefined;
  requireString(contract?.id, "contract.id");
  requireString(contract?.version, "contract.version");
  const source = artifact.source as Record<string, unknown> | undefined;
  requireString(source?.teiCommit, "source.teiCommit");
  const profile = artifact.profile as Record<string, unknown> | undefined;
  if (profile?.schemaVersion !== "mmi-format-profile-v1") {
    throw new Error("profile.schemaVersion must be mmi-format-profile-v1");
  }
  const status = profile.status;
  if (status !== "candidate" && status !== "approved") {
    throw new Error("profile.status must be candidate or approved");
  }
  return {
    schema: ARTIFACT_SCHEMA,
    contract: { id: requireString(contract?.id, "contract.id"), version: requireString(contract?.version, "contract.version") },
    source: source as unknown as ProjectionSource,
    profile: {
      schemaVersion: "mmi-format-profile-v1",
      id: requireString(profile?.id, "profile.id"),
      label: requireString(profile?.label, "profile.label"),
      purpose: requireString(profile?.purpose, "profile.purpose"),
      status,
      featureVersion: requireString(profile?.featureVersion, "profile.featureVersion"),
      sourceProfileId: requireString(profile?.sourceProfileId, "profile.sourceProfileId"),
      features: requireStringArray(profile?.features, "profile.features"),
      sourceEvidence: requireStringArray(profile?.sourceEvidence, "profile.sourceEvidence"),
    },
  };
}
