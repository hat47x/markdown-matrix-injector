# Issue: Worksheet review-route evaluation record comparison contractを実装する

## Meta
- Type: Evaluation governance / Comparison
- Status: Open
- Priority: High
- Scope: validated record-to-record comparison, independent change dimensions, label-only re-evaluation detection
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0177 Done
- Related: issue-0179 Evaluation Record JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel: issue-0180 structured-artifact neutral observation research
- Parallel exclusion: neutral observation / matcher / production review pathは変更しない

## Problem

issue-0177/0179でevaluation recordをsemantic validation付きcanonical artifactとして保存・受け渡しできるようになった。

しかし2本のrecordを比較するとき、callerが単純なJSON diffだけを見ると:
- plan change
- provider-visible packet change
- provider response change
- human ground-truth correction
- report metric change
を混同しやすい。

特にlabel-only offline re-evaluationとprovider outcome rerunを同じ「record changed」と扱うと、provider再実行の有無を追跡できない。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonV1` を追加する。

比較前に左右recordをissue-0177 validatorでstrict validationする。

comparisonはoverall score / winner / better-worse判定を持たず、独立change dimensionだけを返す。

## Comparison dimensions

### Record identity

- leftRecordDigest
- rightRecordDigest
- sameRecord

### Plan

- samePlanDigest
- samePacketDigest
- sameReadinessPolicy
- sameProvider

### Provider response

- sameResponse
- changedCaseIds

case id集合のunionをcanonical sortし、missing / added / changed outcome recordをchangedとして扱う。

### Ground truth

- sameGroundTruthDigest
- changedExpectedRouteCaseIds
- labelOnlyReevaluation

`labelOnlyReevaluation=true` は厳密に:

```text
same planDigest
AND same packetDigest
AND same stored response
AND different groundTruthDigest
```

のときだけ。

### Report

- sameSummary
- sameProjectionSeparability
- sameProvider

## Important semantics

comparisonは「どちらが良いか」を決めない。

例えば:
- decisionAccuracyが上がった
- unsafeRoutineRateが下がった
という差があっても、comparison artifact自身は改善/悪化ラベルを付けない。

human ground-truth correctionでmetricが動く場合とprovider responseが変わってmetricが動く場合を分離することが目的。

## Canonical comparison rules

- provider capabilitiesはsorted setとして比較。
- readiness policy / response / summary / separabilityはrecursive key-order-insensitive canonical JSON equality。
- response changedCaseIdsはcaseIdごとのoutcome record比較。
- expected-route changedCaseIdsはreport.caseResultsのexpectedRouteだけを比較。
- changedCaseIdsはunique canonical sorted。

## Strict validator

comparison artifactにもstrict validatorを追加する。

- exact top-level/nested keys。
- digest format。
- boolean types。
- changed case id arrays unique + sorted。
- sameRecordはrecordDigest equalityと一致必須。
- labelOnlyReevaluationは上記論理式と一致必須。
- sameRecord=trueなら全same flag=true、changed case arrays emptyを要求。

validatorはsource recordsを持たないため、各same flagを外部recordから再計算するsemantic authorityではない。
canonical comparison生成関数がそのauthority。

## Non-disclosure

comparison artifactへ以下を新規保存しない:
- evidence facts
- annotations
- annotator/adjudicator identity
- raw worksheet
- projection state payload
- provider probability/confidence
- expected routeそのもの

変更されたcase idだけを保持する。

## Acceptance criteria

- [ ] comparison schema/version/representationを固定。
- [ ] 両recordをissue-0177 validatorで検証。
- [ ] sameRecordをrecordDigestで算出。
- [ ] planDigest / packetDigest / readiness policy / providerを独立比較。
- [ ] stored responseを独立比較。
- [ ] response changedCaseIdsをcanonical算出。
- [ ] groundTruthDigestを独立比較。
- [ ] changedExpectedRouteCaseIdsをcanonical算出。
- [ ] labelOnlyReevaluationを厳密条件で算出。
- [ ] report summary / projection separability / providerを独立比較。
- [ ] provider capabilities orderを無視。
- [ ] object key orderを比較上無視。
- [ ] strict comparison validator。
- [ ] unknown fieldをreject。
- [ ] unsorted/duplicate case idsをreject。
- [ ] logical invariant mismatchをreject。
- [ ] comparison artifactへraw evidence / label identity metadataを入れない。
- [ ] overall verdict / score / winner / recommendationを追加しない。
- [ ] source recordsをmutateしない。
- [ ] production runtime / provider execution / storageを変更しない。

## Validation plan

- identical record。
- label-only offline re-evaluation。
- same-plan provider outcome rerun。
- readiness-policy-only plan change。
- provider-visible packet change。
- provider capability order equivalence。
- strict validator unknown/invariant/order rejection。
- non-disclosure。
- immutability。
- strict compile。
