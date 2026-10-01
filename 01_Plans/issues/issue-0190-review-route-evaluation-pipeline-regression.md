# Issue: Review-route evaluation pipeline cross-layer regression

## Meta
- Type: Regression / integration qualification
- Status: In Progress（実装完了。ローカルでの実行確認が残り）
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

## 2026-09-23 source verification

- Added four actual-module integration test cases in test/worksheetReviewRouteEvaluationPipeline.test.ts.
- Inspected the real, current exports of all 12 imported experimental modules against test imports: 12/12 module interfaces resolved, no missing named exports.
- Confirmed test cases cover successful local run -> record codec -> offline label-only replay -> comparison plan codec -> execution record codec; explicit noncompliance; stale/readiness/pair/digest failure; and an abstained provider outcome.
- Regression tests use an in-process local stub, synthetic evidence, and existing exported APIs. No production module, matcher, workbook, cloud transport, or research fixture is modified.
- Verification limit: this execution environment does not have the private repository checkout/dependency tree and cannot resolve GitHub from its shell. GitHub Actions are explicitly paused due the usage cap. Consequently no actual TypeScript build, npm unit-suite result, or live Jev evaluation is claimed. Run the new test and build in an authorized local checkout before considering the test runtime-verified.

This milestone adds an end-to-end test artifact; runtime verification remains a separately tracked completion condition.

## Local qualification command

issue-0191で、actual checkout上の残検証を1コマンドへ固定した。

```sh
cd 03_Implement
npm run qualify:review-route-evaluation-pipeline
```

このcommandは `npm run build` 成功後に `test/worksheetReviewRouteEvaluationPipeline.test.ts` だけを実行する。

GitHub Actionsは利用量上限のため引き続き使用しない。上記commandのactual success evidenceが得られるまでは、本Issueの `Status: Implementation complete; local execution pending` を変更しない。
