# Deterministic Review Evidence Overlay v1

## 1. 目的

MMIには現在、human review向けに複数の異なる情報源が存在する。

```text
Authority Plane
  deterministic source / parser / resolver / preview checks

Cognitive Perception
  provider-neutral candidate ranking / ambiguity / novelty

Cognitive Judgment
  optional proposal-only bounded judgment

Worksheet review telemetry
  deterministic comparison-derived review reasons
```

最後のreview telemetryを他3つへ混ぜずに提示するためのcontractが本overlayである。

## 2. なぜCognitive Signalにしないのか

fill review reasonはFly providerが生成したsignalではない。

たとえば:

```text
fill-induced-ambiguity
```

は:

```text
structure-only matcher result
vs
structure+fill matcher result
```

を決定論的に比較した結果である。

provider capabilityでも推論でもない。

これをCognitive Perceptionへ入れると:

- provider provenanceが不正確になる
- matcher resultとmeta-analysisが同じ層になる
- 将来別providerへ切り替えたとき意味が曖昧になる

ため分離する。

## 3. なぜAuthority checkにしないのか

Authority checkは:

- source identity
- profile compatibility
- parser
- parameter schema
- resolver
- containment
- source existence
- preview

のように、実行可否に必要な決定論的再検証である。

一方:

```text
fill-supported-acceptance
fill-changed-winner
```

はmatcher判断の説明情報であり、Authority pass/failではない。

したがってAuthority receiptへも入れない。

## 4. Artifact構造

```text
DeterministicReviewEvidenceV1
├─ source identity
├─ worksheet feature/profile provenance
├─ deterministic producer identity
├─ reasons
└─ paired comparison summary
```

### Producer

```text
kind: deterministic-analysis
componentId: mmi.experimental.worksheet-format-fill-review
componentVersion: 1
executionBoundary: local
```

外部provider識別子ではない。

## 5. Reason role

### review-relevant

decision boundaryやcandidate identityへ影響した事実。

または、候補識別に必要なevidenceが取得できない事実。

### diagnostic-only

fill unavailableやtone disagreementのように、それ単独ではreview requirementとして弱い事実。

この区分はissue-0139/0140のnoise評価に基づく。

## 6. Perception binding

artifactのprimary pathは、Cognitive Review Envelopeに入っているFly Perception結果と一致しなければならない。

```text
primary fill-aware result
       |
       | exact match
       v
Fly Perception payload
```

比較:

- classification
- winner
- novelty
- candidate order
- candidate scores
- source profile
- feature version

これによりreview reasonが「別のmatcher run」へすり替わることを防ぐ。

## 7. Surface構造

既存schemaは変更しない。

```text
DeterministicReviewEvidenceSurfaceV1
├─ surface
│  ├─ Cognitive review
│  └─ Authority verification
└─ deterministicReviewEvidence
```

proposal identityを持つ既存surfaceでも、review + Authority boundaryを保つ限り同じwrapper conceptを使える。

## 8. Apply authority

このoverlayは:

```text
writeAuthority = none
applyStatus = not-authorized
```

を変更しない。

review-relevant reasonが1件以上あっても、auto rejectを意味しない。

reasonが0件でも、auto acceptを意味しない。

Authority satisfiedでも同じ。

## 9. Privacy / payload

artifactへ入れないもの:

- raw worksheet cells
- raw feature vector
- workbook bytes
- raw Notation
- evaluation fixtureのexpectedReview
- provider prompt
- external model payload

reviewに必要な要約だけを持つ。

## 10. 将来の一般化

現在のproducerはworksheet-format fill comparison専用。

将来:

- multi-family drift
- snapshot drift
- balance boundary

などを同じsurfaceへ載せる場合、すぐにgeneric reason engineへ統合しない。

各reason familyについて:

1. deterministic derivation
2. noise評価
3. provenance
4. review relevance

が確立してからproducerを追加する。

surface contractはproducer-neutralへ拡張可能だが、reason semanticsまで早期に一般化しない。


## 11. Source identityとの責務分離

issue-0152の`source-file-bytes-v1`がsource identityのcanonical primitiveである。

本overlayは:

- bytesをhashしない
- pathをresolveしない
- containmentを判定しない
- byteLengthを再計算しない

Envelope / verified surfaceへ既にbindingされた`sourceDigest`を比較するだけとする。

将来Cognitive Observation builderがissue-0152 primitiveを直接利用するようになっても、このoverlayの責務は変えない。
