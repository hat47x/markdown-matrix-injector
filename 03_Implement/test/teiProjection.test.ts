import assert from "node:assert/strict";
import test from "node:test";

import { parseFormatProfileProjection } from "../src/teiProjection";

const artifact = {
  schema: "tai.reference.tei-mmi-format-profile-projection/v0",
  contract: { id: "mmi.format-profile.projection", version: "1" },
  source: {
    teiCommit: "abc",
    contract: {
      contractId: "mmi.format-profile.record",
      contractVersion: "1",
      contractDigest: "sha256:x",
      sourceDigest: "sha256:y",
      cases: 3,
    },
  },
  profile: {
    schemaVersion: "mmi-format-profile-v1",
    id: "profile-a",
    label: "Profile A",
    purpose: "Render tables",
    status: "candidate",
    featureVersion: "1.0.0",
    sourceProfileId: "profile-base",
  },
};

test("parses a valid projection", () => {
  const parsed = parseFormatProfileProjection(artifact);
  assert.equal(parsed.profile.id, "profile-a");
  assert.equal(parsed.profile.status, "candidate");
});

test("rejects a wrong schema", () => {
  assert.throws(() => parseFormatProfileProjection({ ...artifact, schema: "other" }));
});

test("rejects an invalid status", () => {
  const broken = { ...artifact, profile: { ...artifact.profile, status: "draft" } };
  assert.throws(() => parseFormatProfileProjection(broken));
});

test("rejects a missing profile id", () => {
  const broken = { ...artifact, profile: { ...artifact.profile, id: "" } };
  assert.throws(() => parseFormatProfileProjection(broken));
});
