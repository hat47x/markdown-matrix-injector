import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseFormatProfileProjection } from "../src/teiProjection.js";

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
    features: ["table"],
    sourceEvidence: ["structure"],
  },
};

test("parses a valid projection", () => {
  const parsed = parseFormatProfileProjection(artifact);
  assert.equal(parsed.profile.id, "profile-a");
  assert.equal(parsed.profile.status, "candidate");
  assert.deepEqual(parsed.profile.features, ["table"]);
  assert.deepEqual(parsed.profile.sourceEvidence, ["structure"]);
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

test("parses the real artifact when provided", (t) => {
  const path = process.env.TEI_MMI_PROJECTION_ARTIFACT;
  if (!path) {
    t.skip("TEI_MMI_PROJECTION_ARTIFACT is not set");
    return;
  }
  const parsed = parseFormatProfileProjection(JSON.parse(readFileSync(path, "utf8")));
  assert.ok(parsed.profile.id.length > 0);
});
