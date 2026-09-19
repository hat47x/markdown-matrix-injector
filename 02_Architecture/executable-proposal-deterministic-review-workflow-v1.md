# Executable Proposal Deterministic Review Workflow v1

## 1. 目的

既存の安全境界を再実装せず、1つのentrypointで次をつなぐ。

```text
issue-0157 Profile-backed Fill Review Analysis
issue-0154 Deterministic Review Evidence
issue-0150 Executable Proposal Verified Review Workflow
issue-0155 Unified Human Review View Model
```

このworkflow自身は新しい認知・Authority・表示意味を作らない。

## 2. Entry points

```text
prepareExecutableProposalDeterministicReviewWithLoader
prepareExecutableProposalDeterministicReviewWithDefaultLoader
```

## 3. Deterministic input

```text
observationSnapshot
approvedProfiles
```

持たないもの:

```text
prototypeSnapshots
expectedReview
telemetry
matchOptions
prepared evidence
prepared presentation
prepared receipt
```

## 4. Internal flow

```text
approved Profiles
        |
        v
assert Profiles == Envelope profile refs
        |
        v
analyzeWorksheetFormatFillReviewFromProfiles
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
createUnifiedHumanReviewViewModel
```

## 5. なぜbaseline snapshotを要求しないか

approved Format Profileはcanonical feature vectorを保持する。

issue-0157はそのfeaturesから:

- fill-aware prototype
- structure-only control prototype

を決定論的に構成できる。

そのためruntime reviewのためにprototype baseline worksheetを再読込しない。

## 6. Profile binding

Profile-backed analysisへ渡す前に、approved Profile objectをEnvelope refへ照合する。

照合対象:

- id / count / duplicate
- label
- featureVersion
- sourceProfileId
- sourceEvidence
- baselineSourceDigest
- approvalReference
- approved status

Envelope refはreview surface用の軽量identity、Format Profile本体はcanonical featuresを持つ資産である。

両者を一致させてからanalysisする。

## 7. Observation binding

Profile-backed analysisはobservation snapshotからfill-aware resultを再計算する。

issue-0154 evidence builderが、そのresultをEnvelope Perceptionへcandidate単位でbindingする。

したがってworkflow自身に2つ目のmatcher consistencyロジックを持たない。

## 8. Authorityとの順序

deterministic input validationはWorkbook loaderより前。

不正Profileやobservationのためにsource/workbookを読む必要はない。

Authority workflowはdeterministic evidenceがEnvelopeへbindingできた後に呼ぶ。

## 9. Final model

新規surface schemaは作らない。

最終出力はissue-0155:

```text
UnifiedHumanReviewViewModelV1
├─ proposalIdentity
├─ authority
├─ cognitive
└─ deterministic
```

各domainは独立した意味を保つ。

## 10. Status semantics

- Authority satisfied ≠ human approved
- Authority blocked ≠ Cognitive result invalid
- Perception matched ≠ proposal executable
- Judgment proposal-only ≠ apply authority
- deterministic review-relevant ≠ auto reject

overall verdict / combined scoreは作らない。

## 11. Serialization boundary

保持しない:

- raw Notation
- raw worksheet cells
- raw Format Profile feature arrays
- expectedReview
- WorkbookData
- resolved absolute path
- source bytes

保持する:

- proposal digest
- source digest
- Profile refs
- Authority evidence codes
- Cognitive presentation
- deterministic reason / comparison summary

## 12. Source identity

source identityはissue-0152/0153の責務。

本workflowはhash / containment / stable readを再実装しない。

## 13. 残存制約

observation snapshot自体にはcanonical digestがない。

現在はsource identity + Profile identity + full Perception result bindingを利用する。

新しいsnapshot identityをCognitive/Authority schemaへ追加する判断は別Issueとする。

## 14. 非責務

- production UI
- plugin wiring
- source / Markdown write
- automatic approval
- apply command
- model invocation
- profile approval
- matcher/scoring変更
- fill taxonomy変更
