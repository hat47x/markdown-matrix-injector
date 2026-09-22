# Issue: Worksheet review-route planned comparison execution recordを実装する

## Meta
- Type: Evaluation governance / Reproducibility
- Status: Done
- Priority: High
- Scope: predeclared comparison plan + policy result linkage + immutable execution digest
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0183 Done
- Depends on: issue-0186 Done
- Related: issue-0187 Comparison Plan JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0186で比較前のrecord pair + policyをplanDigestへ固定できるが、実行後のpolicy resultを「どのplanから得たか」一体のartifactとして保持するcontractがない。

issue-0184 result artifact単体はpolicy snapshotを含むが、predeclared planDigestを保持しない。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1` を追加する。

record:
- schemaVersion
- representation
- purpose
- planDigest
- leftRecordDigest
- rightRecordDigest
- plan
- result
- executionDigest

## Linkage

strict validatorで:

- planをissue-0186 validatorで検証。
- resultをissue-0183 validatorで検証。
- top-level planDigest == plan.planDigest。
- top-level left/right digest == plan left/right digest。
- result.comparison left/right digest == plan left/right digest。
- result.policy == plan.policy（canonical semantic equality）。
- executionDigestをrecord contentから再計算。

## executionDigest

SHA-256 content identity。

authentication signature / trusted timestampではない。

## Creation

`createWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord(plan, completed)`:

- completed.status == completed。
- completed.planDigest == plan.planDigest。
- completed.result strict validation。
- plan/result linkageを確認。
- plan/resultをcloneしてsnapshot。
- executionDigestを計算。
- final recordをstrict validation。

## Important semantics

policy noncompliance resultも正常なexecution recordとして保存できる。

`compliant=false` は「plan execution失敗」ではない。

## Acceptance criteria

- [x] record schema/version/representationを固定。
- [x] planDigest / left/right digestをtop-level保持。
- [x] plan snapshotを保持。
- [x] policy result snapshotを保持。
- [x] executionDigestをSHA-256生成。
- [x] issue-0186 plan validatorを再利用。
- [x] issue-0183 policy-result validatorを再利用。
- [x] planDigest linkage。
- [x] directional left/right digest linkage。
- [x] result comparison digest linkage。
- [x] result policy == plan policy。
- [x] unknown fieldをreject。
- [x] executionDigest tamperをreject。
- [x] completed planDigest mismatchをreject。
- [x] mismatched result pairをreject。
- [x] mismatched result policyをreject。
- [x] compliant=false resultも正常にrecord化。
- [x] source plan/resultをmutateしない。
- [x] signature / timestamp / persistence / deployment semanticsを追加しない。

## Validation plan

- valid compliant execution。
- valid noncompliant execution。
- deterministic executionDigest。
- unknown/tampered record。
- completed planDigest mismatch。
- result pair mismatch。
- result policy mismatch。
- immutability。
- strict compile。


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0186 plan / issue-0183 policy-result interface-compatible focused environmentで
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - valid planned comparisonからdeterministic executionDigestを生成。
  - completed.planDigest mismatchをrecord生成前にreject。
  - result.comparisonのdirectional left/right digest mismatchをstrict validatorでreject。
  - `compliant=false` policy resultも正常なexecution recordとして保存・再validate。
  - noncompliant recordにはtyped violationsを保持。
- repository test sourceではさらに:
  - unknown field / executionDigest tamper rejection。
  - semantically validだが別policyで評価されたresultをreject。
  - source plan / completed result immutability。
  - plan/result snapshot linkage。
- executionDigestはcontent identityであり、signature / trusted timestampではない。
- filesystem/database/cloud persistence、better/worse、ranking、deployment semanticsは追加していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
