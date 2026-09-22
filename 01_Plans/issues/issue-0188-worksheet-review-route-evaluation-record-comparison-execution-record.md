# Issue: Worksheet review-route planned comparison execution recordを実装する

## Meta
- Type: Evaluation governance / Reproducibility
- Status: Open
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

- [ ] record schema/version/representationを固定。
- [ ] planDigest / left/right digestをtop-level保持。
- [ ] plan snapshotを保持。
- [ ] policy result snapshotを保持。
- [ ] executionDigestをSHA-256生成。
- [ ] issue-0186 plan validatorを再利用。
- [ ] issue-0183 policy-result validatorを再利用。
- [ ] planDigest linkage。
- [ ] directional left/right digest linkage。
- [ ] result comparison digest linkage。
- [ ] result policy == plan policy。
- [ ] unknown fieldをreject。
- [ ] executionDigest tamperをreject。
- [ ] completed planDigest mismatchをreject。
- [ ] mismatched result pairをreject。
- [ ] mismatched result policyをreject。
- [ ] compliant=false resultも正常にrecord化。
- [ ] source plan/resultをmutateしない。
- [ ] signature / timestamp / persistence / deployment semanticsを追加しない。

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
