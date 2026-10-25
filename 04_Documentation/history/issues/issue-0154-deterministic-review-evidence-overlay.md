# Issue: deterministic review reasonをCognitive/Authorityと分離したreview evidenceとして露出する

## Meta
- Type: Feature / Review integration experiment
- Status: Done
- Priority: High
- Scope: deterministic worksheet-format review evidence artifact + human-review wrapper
- Expected verification level: focused unit / composition
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0139 / 0140 / 0146 fill review telemetry evidence
- Related: issue-0141 Cognitive Review Envelope
- Related: issue-0142 Cognitive Review Presentation
- Related: issue-0144 Authority Verification Overlay
- Related: issue-0148 Executable Proposal Verified Review Surface
- Related: issue-0149 Authority Workbook Loader Port

## 背景

issue-0139〜0146で、fill review telemetryは次の境界まで確認できた。

- synthetic held-out corpusでhigh-impact reasonとbroad diagnostic factを分離
- LibreOffice external XLSX reader経路で同じ意味分離を再確認
- `fill-supported-acceptance`
- `fill-supported-disambiguation`
- `fill-induced-ambiguity`
- `fill-induced-rejection`
- `fill-changed-winner`
- `fill-unavailable-for-discrimination`

をexternal XLSXでも再現

一方、Cognitive Assistance Plane側ではissue-0141〜0149により:

```text
Cognitive Review Envelope
 -> human-review presentation
 -> Authority verification overlay
 -> exact proposal identity
 -> Authority adapter / loader port
```

まで進んでいる。

次に必要なのは、deterministic review reasonをhuman review surfaceへ出すことである。

ただしreasonの由来はCognitive providerではない。

```text
worksheet matcher
  + deterministic paired comparison
        |
        v
deterministic review reason
```

である。

したがっては次のとおりです。

- Perceptionへ混ぜない
- Judgmentへ混ぜない
- Authority checkへ混ぜない
- provider provenanceへ偽装しない

ことが重要。

## 設計判断

既存schemaを変更しない。

新規artifact:

```text
DeterministicReviewEvidenceV1
```

と、それを既存verified human-review surfaceへ添付するwrapper:

```text
DeterministicReviewEvidenceSurfaceV1
```

を追加する。

既存は次のとおりです。

- CognitiveReviewPresentationV1
- AuthorityVerificationOverlayV1
- VerifiedCognitiveReviewSurfaceV1
- ExecutableProposalVerifiedReviewSurfaceV1

は変更しない。

## Artifact role

```text
role = deterministic-review-evidence
```

producer:

```text
kind = deterministic-analysis
componentId = mmi.experimental.worksheet-format-fill-review
componentVersion = 1
executionBoundary = local
```

Cognitive provider descriptorを使用しない。

Authority issuerも使用しない。

## Reason taxonomy

既存telemetry codeをそのまま保持する。

### decision-impact / review-relevant

- fill-supported-acceptance
- fill-supported-disambiguation
- fill-induced-ambiguity
- fill-induced-rejection
- fill-changed-winner

### evidence-unavailable / review-relevant

- fill-unavailable-for-discrimination

### diagnostic / diagnostic-only

- fill-unavailable
- fill-tone-disagreement

`expectedReview` はevaluation fixture用ラベルなのでartifactへ持ち込まない。

## Comparison evidence

reasonだけでは判断経路を確認しにくいため、artifactにはpaired comparisonの要約を持つ。

```text
comparison.kind = worksheet-format-fill-vs-structure-only

primary:
  structure + fill
  sourceProfileId
  status
  winnerPrototypeId
  topPrototypeId
  topConfidence
  topTwoMargin
  noveltyScore

control:
  structure only
  同上
```

raw cells / raw features / workbook bytesは持たない。

## Perception binding

最大の安全境界。

deterministic evidenceを生成する際、primary pathがEnvelopeのFly Perception payloadと完全一致することを要求する。

比較対象は次のとおりです。

- classification
- noveltyScore
- winner prototype
- candidate count
- candidate order
- prototype id
- confidence
- deviationScore
- sparseSimilarity
- featureSimilarity
- sourceProfileId
- featureVersion

一致しない場合はfail-closed。

これによりは次のとおりです。

> 同じsourceDigestを持つ別matcher結果のtelemetry

をreview surfaceへ誤添付しにくくする。

## Surface wrapper

新しいwrapper:

```text
DeterministicReviewEvidenceSurfaceV1
  audience = human-review
  surface = existing verified review surface
  deterministicReviewEvidence = separate artifact
```

既存surface自体を書き換えない。

構造的には次のとおりです。

```text
VerifiedCognitiveReviewSurfaceV1
```

または同じは次のとおりです。

- audience
- review
- authorityVerification

境界を持つsurfaceを包める。

Executable Proposal surfaceも同じreview/Authority boundaryを持つため、将来同じwrapperで合成可能。

## Attachment-time revalidation

artifact作成後にobjectが書き換えられる場合も考え、surfaceへ添付する際に再検証する。

確認は次のとおりです。

- schemaVersion
- role
- producer identity
- local deterministic boundary
- featureVersion
- sourceDigest
- sourceProfileId
- comparison kind
- reason code重複
- reason category / reviewRole
- reason count
- primary comparisonとPerception
- surface review sourceDigest
- surface Authority sourceDigest
- sourceEvidence
- review-only / no-write / not-authorized

## Non-goals

- matcher status変更
- review reasonによるauto reject / auto accept
- Cognitive Judgment生成
- Authority check生成
- apply authority付与
- production plugin/extension wiring
- UI component実装
- raw worksheet serialization
- external provider送信

## Acceptance criteria

- [x] `DeterministicReviewEvidenceV1` を追加
- [x] deterministic producer descriptorをCognitive providerとは別型で表現
- [x] reason codeをreview-relevant / diagnostic-onlyへ分類
- [x] `expectedReview` をartifactへ含めない
- [x] paired comparison summaryを保持
- [x] raw cells/featuresを保持しない
- [x] primary matcher resultをFly Perception payloadへ完全binding
- [x] source profile / feature versionをbinding
- [x] existing verified surfaceを変更しないwrapperを追加
- [x] attachment時にartifact shapeを再検証
- [x] attachment時にsource/provenanceを再検証
- [x] attachment時にreview-only/no-write boundaryを再検証
- [x] decision-impact focused test
- [x] essential-unavailable focused test
- [x] diagnostic-only focused test
- [x] mismatched candidate scoreをreject
- [x] mismatched source profileをreject
- [x] mismatched source digestをreject
- [x] input artifactsをmutateしない
- [x] serialized deterministic evidenceにraw cells/features/evaluation labelを含めない
- [x] existing Cognitive / Authority schemasを変更しない
- [x] production runtimeを変更しない

## Concurrent reconciliation

作業途中で他レーンがissue-0150 executable proposal review workflow、issue-0151 Notation parameter contractをmainへ統合したため、本Issueは当初の0150からいったん0152へ採番し直した。

その後、issue-0152 Source Identity Contractも他レーンからmainへ統合されたため、本Issueはその後issue-0153へ繰り下げた。

さらにissue-0153 Contained Cognitive Observation builderがmainへ統合されたため、本Issueは最終的に**issue-0154**へ繰り下げた。issue-0153によりCognitive ObservationのsourceDigestはissue-0152 canonical identityから生成できるようになり、本Issueのbinding前提と整合する。\n\nいずれの並行レーンもfill telemetry / deterministic review evidenceは変更していない。各main更新を同一作業ブランチへ取り込み、branchを分岐させずに同期した。

## Source identity contractとの境界

issue-0152で`source-file-bytes-v1`のcanonical SHA-256 identity primitiveがmainへ追加された。本Issueはdigestを生成せず、Cognitive Review Envelopeが保持する`sourceDigest`をbinding keyとして消費するだけとする。source bytesのhash規則・containment・byteLengthはissue-0152の責務であり、review evidence側へ再実装しない。

## Validation policy

今回の追加はpure experimental TypeScriptで、XLSX readerを直接呼ばない。

focused testは既存snapshot/matcher/Profile/Cognitive/Authority compositionを使う。

GitHub Actionsの既知runner/resource不足は完了条件にしない。

現在の実行環境にrepository checkout/dependency treeがない場合は、runtime test passを主張せず、strict API整合・deterministic boundary・diff確認を記録する。

## 次段階

次はこのartifactをproductionへ接続するのではなく、issue-0148/0149のproposal-bound verified surfaceに対し:

1. exact proposal identity
2. Authority verification
3. Cognitive review
4. deterministic review evidence

を1つのhuman-review view modelでどう並べるかを検討する。

その際もdeterministic reasonをCognitive provider evidenceへ変換しない。

また、fill以外のmulti-family drift reasonへ同じartifact contractを一般化する必要があるかは、別Issueで評価してから判断する。
