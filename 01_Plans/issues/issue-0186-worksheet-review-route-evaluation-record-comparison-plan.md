# Issue: Worksheet review-route evaluation record comparison planを実装する

## Meta
- Type: Evaluation governance / Predeclaration
- Status: Open
- Priority: High
- Scope: directional record pair + explicit comparison policy + plan digest + planned comparison execution
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0177 Done
- Depends on: issue-0181 Done
- Depends on: issue-0183 Done
- Depends on: issue-0185 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0183でcomparison change policyを明示でき、issue-0185でpolicy単体のcanonical bytesも固定できる。

しかし比較実行時に:
- 左右record
- policy
の組み合わせ自体を事前固定するcontractがない。

policy artifactを事前保存していても、別record pairへ適用した場合やA→BとB→Aを取り違えた場合を一つのplan identityで追跡できない。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonPlanV1` を追加する。

plan:
- schemaVersion
- representation
- purpose
- leftRecordDigest
- rightRecordDigest
- policy
- planDigest

## Directionality

left / rightは意味を持つ。

```text
A -> B != B -> A
```

planDigestは順序付きrecord digestをbindする。

## Plan creation

`createWorksheetReviewRouteEvaluationRecordComparisonPlan(left, right, policy)`:

1. left/rightをissue-0177 validatorでstrict validation。
2. policyをissue-0183 validatorでstrict validation。
3. recordDigestを方向付きでsnapshot。
4. policyをcloneしてsnapshot。
5. canonical tupleからSHA-256 planDigestを生成。

## Plan digest

digest input:
- representation
- leftRecordDigest
- rightRecordDigest
- policy schema/purpose
- allowedChangesを固定順で列挙
- labelOnlyReevaluation

object key orderには依存しない。

policy resultやcomparison resultはdigestへ含めない。

## Planned execution

`runWorksheetReviewRouteEvaluationRecordComparisonPlan(left, right, plan)`:

1. plan strict validation。
2. left/right recordをissue-0177 validatorで再検証。
3. runtime left/right recordDigestがplanと一致しない場合、comparison生成前にreject。
4. issue-0181 comparisonを生成。
5. issue-0183 policy guardをplan.policyで評価。
6. `planDigest + policy result` を返す。

policy noncompliance自体は実行errorではない。
typed resultの `compliant=false` とviolationsで表す。

## Important semantics

planDigestは「どのrecord pairをどのchange policyで比較すると事前に決めたか」のidentity。

better/worse、winner、provider ranking、deployment approvalを意味しない。

## Acceptance criteria

- [ ] plan schema/version/representationを固定。
- [ ] left/right recordDigestを方向付きで保持。
- [ ] policyをsnapshot。
- [ ] planDigestをSHA-256で生成。
- [ ] object key order非依存のdigest。
- [ ] A→BとB→AでplanDigestが異なる。
- [ ] policy変更でplanDigestが変わる。
- [ ] same inputsでdeterministic。
- [ ] issue-0177 record validatorを再利用。
- [ ] issue-0183 policy validatorを再利用。
- [ ] strict plan validator。
- [ ] unknown fieldをreject。
- [ ] tampered planDigestをreject。
- [ ] malformed record digestをreject。
- [ ] runtime left record mismatchをcomparison前にreject。
- [ ] runtime right record mismatchをcomparison前にreject。
- [ ] issue-0181 comparisonへ委譲。
- [ ] issue-0183 policy resultへ委譲。
- [ ] policy noncomplianceをthrowせずtyped resultで返す。
- [ ] source records / policy / planをmutateしない。
- [ ] live provider / storage / signature / deployment semanticsを追加しない。

## Validation plan

- deterministic plan creation。
- reverse direction digest difference。
- policy change digest difference。
- unknown/tampered plan rejection。
- left/right mismatch rejection。
- compliant planned comparison。
- noncompliant planned comparison。
- immutability。
- strict compile。
