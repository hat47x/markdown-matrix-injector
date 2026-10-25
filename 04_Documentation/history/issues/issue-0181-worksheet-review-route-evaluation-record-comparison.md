# Issue: Worksheet review-route evaluation record comparison contractを実装する

## Meta
- Type: Evaluation governance / Comparison
- Status: Done
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

例えばは次のとおりです。
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

- [x] comparison schema/version/representationを固定。
- [x] 両recordをissue-0177 validatorで検証。
- [x] sameRecordをrecordDigestで算出。
- [x] planDigest / packetDigest / readiness policy / providerを独立比較。
- [x] stored responseを独立比較。
- [x] response changedCaseIdsをcanonical算出。
- [x] groundTruthDigestを独立比較。
- [x] changedExpectedRouteCaseIdsをcanonical算出。
- [x] labelOnlyReevaluationを厳密条件で算出。
- [x] report summary / projection separability / providerを独立比較。
- [x] provider capabilities orderを無視。
- [x] object key orderを比較上無視。
- [x] strict comparison validator。
- [x] unknown fieldをreject。
- [x] unsorted/duplicate case idsをreject。
- [x] logical invariant mismatchをreject。
- [x] comparison artifactへraw evidence / label identity metadataを入れない。
- [x] overall verdict / score / winner / recommendationを追加しない。
- [x] source recordsをmutateしない。
- [x] production runtime / provider execution / storageを変更しない。

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


## Validation evidence

### 2026-09-22 focused validation

- TypeScript: strict compile成功。
  - `target ES2022`
  - `module NodeNext`
  - `moduleResolution NodeNext`
  - `strict=true`
- GitHub branch上の `worksheetReviewRouteEvaluationRecordComparison.ts` と同一実装を、issue-0177 record / provider descriptorのinterface-compatible stubでcompile。
- focused runtime: **5/5 PASS / 0 fail**。
  1. identical recordでは全same flag=true、change case list空、overall verdictなし。
  2. issue-0177 label-only offline re-evaluationではplan/packet/response同一、groundTruthのみ差分、`labelOnlyReevaluation=true`、changed expected-route case idのみを抽出。
  3. same-plan provider rerunではresponse changed caseだけを抽出し、label-onlyとは判定しない。
  4. provider capabilitiesの順序差はprovider/response semantic equalityへ影響させない。一方recordDigest content identityは別のまま維持。
  5. unknown field / unsorted case ids / sameResponse-change-list矛盾 / ground-truth invariant矛盾 / labelOnly invariant矛盾をfail-closed。
- response比較ではprovider descriptorのcapabilitiesだけをcanonical sortし、probability/confidence等provider outcome内容はそのまま比較する。
- comparison artifactはcase id以外のexpected route値、probability/confidence、evidence、annotation/adjudication provenanceを複製しない。
- overall score / winner / better-worse / recommendation / deployment判断を追加していない。
- source recordをmutateしない。
- provider実行 / persistence / production routingは変更していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
