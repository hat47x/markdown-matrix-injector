# Executable Proposal Deterministic Review Workflow v1

## 1. 目的

Executable Proposal reviewに、deterministic worksheet-format review evidenceを安全に加える。

既存の3つの系統を統合するが、意味は統合しない。

```text
Proposal identity
Authority verification
Cognitive review
Deterministic review evidence
```

## 2. Entry point

### with loader

```text
prepareExecutableProposalDeterministicReviewWithLoader
```

### default loader

```text
prepareExecutableProposalDeterministicReviewWithDefaultLoader
```

callerは完成済みPresentation / Receipt / Evidenceを渡せない。

## 3. Deterministic input

入力:

```text
observationSnapshot
prototypeSnapshots
approvedProfiles
```

入力しない:

```text
expectedReview
telemetry
DeterministicReviewEvidence
matchOptions
```

## 4. Internal flow

```text
deterministicReview input
        |
        v
assert prototype IDs == Envelope profile IDs
        |
        v
assert approved Profiles == Envelope refs
        |
        v
derive prototype features from snapshots
        |
        v
assert derived features == approved Profile features
        |
        v
analyzeWorksheetFormatFillReviewCase
        |
        v
createWorksheetFormatDeterministicReviewEvidence
        |
        +-- primary result != Fly Perception -> fail closed
        |
        v
prepareExecutableProposalVerifiedReview*
        |
        v
createDeterministicReviewEvidenceSurface
        |
        v
flatten into UI-neutral sibling model
```

## 5. なぜProfile objectまで要求するか

Envelopeはreview向けrefだけを保持し、canonical feature vector自体は持たない。

prototype snapshotをIDだけで受け取ると:

```text
id = release-table
snapshot = unrelated format
```

のような入力を十分早く検出できない。

そこでapproved Format Profile本体を要求し:

```text
snapshot -> derived prototype features
approved profile -> canonical features
```

を完全一致させる。

これはProfile approvalをやり直す処理ではない。

既存approval artifactとsnapshotのfeature identityを確認するだけ。

## 6. Observation binding

observation snapshotについては、fill-aware matcherを再実行してEnvelope Perceptionと完全bindingする。

比較:

- status
- winner
- novelty
- candidate count
- order
- confidence
- deviation
- sparse similarity
- feature similarity

これによりdeterministic reasonは、少なくとも同じPerception decision surfaceへ結び付く。

## 7. Result model

```text
ExecutableProposalDeterministicReviewSurfaceV1
```

fields:

```text
schemaVersion
audience = human-review
proposal
review
authorityVerification
deterministicReviewEvidence
```

### proposal

exact executable proposal identity。

### review

既存CognitiveReviewPresentationV1。

内部に:

- review-only Authority boundary presentation
- Perception
- optional Judgment
- provenance

を持つ。

### authorityVerification

deterministic Authority receipt projection。

### deterministicReviewEvidence

fill-aware vs structure-only比較由来のreason。

## 8. 意味を混ぜない

### Authority satisfied

deterministic reasonの消去や承認を意味しない。

### Authority blocked

Perception/Reasonが誤りという意味ではない。

### Perception matched

proposalが実行可能という意味ではない。

### Judgment proposal

apply authorityを持たない。

### deterministic review-relevant

auto rejectを意味しない。

## 9. Fail-closed order

deterministic input validationをAuthority loaderより先に行う。

理由:

- mismatched profile snapshotのためにsource/workbookを読む必要がない
- caller-prepared evidence injectionを許さない
- invalid analysis inputを早期に止める

## 10. Serialization boundary

surfaceへ保持しない:

- raw Notation
- raw worksheet cells
- raw feature vectors
- expectedReview
- WorkbookData
- resolved absolute path
- source bytes

保持する:

- proposal digest
- source digest
- Profile refs
- Cognitive metrics
- Authority evidence codes
- deterministic reason codes
- comparison summary

## 11. Source identity

source identity生成はissue-0152/0153の責務。

本workflowは:

- hashしない
- resolveしない
- Observation sourceDigestを任意生成しない

既存EnvelopeとAuthority workflowのbindingを利用する。

## 12. 残存制約

approved prototype snapshotsはfeature vectorまでProfileへbindingされる。

observation snapshotには独立snapshot digestがないため、Perception result bindingが現在の主要整合性check。

これは意図的なscope boundaryであり、snapshot identityを新設する場合は別contractとする。

## 13. 非責務

- production UI
- plugin wiring
- automatic decision
- source write
- Markdown write
- model invocation
- profile approval
- threshold tuning
- source snapshot identity新設
