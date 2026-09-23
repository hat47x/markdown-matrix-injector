# Issue: Review-route evaluation pipeline cross-layer regression

## Meta
- Type: Regression / integration qualification
- Status: Open
- Priority: High
- Scope: existing issue-0171/0172/0174/0176/0177/0179/0183/0186/0187/0188/0189 contract composition
- Production runtime: no changes

## Purpose

Individual record, policy, and JSON codec tests do not by themselves verify their entire integration chain. Guard against regressions where each isolated artifact validates but cross-layer linkage breaks following parallel changes or branch merges.

## Scenario

Use a synthetic, independently adjudicated four-case corpus and an explicitly local closed-choice stub provider. This is a test fixture, not a measured Jev benchmark or real workbook validation.

1. Fix readiness policy, provider descriptor, and evaluation plan before provider execution.
2. Generate a real planned run, response and evaluation record using the existing APIs.
3. Canonical JSON round-trip the record.
4. Correct one final label while preserving readiness and projection state.
5. Offline re-evaluate the stored record without invoking the provider again.
6. Predeclare an explicit directional comparison policy, serialize its plan, execute against the two actual records, and canonical JSON round-trip the execution record.
7. Confirm that a disallowing comparison policy returns a typed noncompliant execution record, not an execution error.
8. Confirm that readiness regression, stale projection, record substitution, and digest tampering remain fail-closed across boundaries.

## Acceptance criteria

- [ ] New cross-layer test uses real exported production experimental modules, not fabricated record/comparison fixtures.
- [ ] Local provider receives only the canonical four-field projection payload.
- [ ] Readiness policy is explicitly fixed before the run.
- [ ] Initial planned run produces a valid evaluation record with expected decision metrics.
- [ ] Canonical record JSON round-trip and stable artifact filename succeed.
- [ ] Label-only offline reevaluation reuses the response with zero new provider calls.
- [ ] Only ground-truth-derived identities/metrics change; inference plan, packet and response remain unchanged.
- [ ] A directional comparison plan over actual records is serialized and parsed canonically.
- [ ] An allowing policy yields a compliant result and a valid canonical execution-record JSON artifact.
- [ ] A disallowing policy yields a typed noncompliant execution record with explicit violation codes.
- [ ] Readiness regression and stale projection prevent reuse.
- [ ] Reversed or substituted record-pair identity fails before comparison execution.
- [ ] Digest tampering fails at canonical JSON parse.
- [ ] Source corpus, plan and original record stay immutable.
- [ ] Tests require no workbook mutation, live network, API key, cloud runtime, or GitHub Actions.

## Execution constraints

Run the new integration test and strict compile in an actual local repository checkout when dependencies are available. GitHub Actions are paused because of the usage cap; do not dispatch or rerun them. When dependencies cannot be accessed, report this explicitly and distinguish source review from executed evidence.

Do not edit the simultaneous structured-artifact Draft PR research branch or its fixture files.