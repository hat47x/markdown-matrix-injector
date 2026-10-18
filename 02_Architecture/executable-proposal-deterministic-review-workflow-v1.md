# Executable Proposal Deterministic Review Workflow v1

## 1. 目的

既存の安全境界を再実装することなく、1つのentrypoint（処理の入口）から次の既存処理をつなぐ。

```text
issue-0157 Profile-backed Fill Review Analysis
issue-0154 Deterministic Review Evidence
issue-0150 Executable Proposal Verified Review Workflow
issue-0155 Unified Human Review View Model
```

このworkflow（処理の流れ）自身は、認知・Authority（決定論的な検証）・表示について新しい意味を定義しない。

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

次の項目は入力として受け取らない。

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

approved Format Profile（承認済みの書式プロファイル）は、canonical feature vector（基準となる特徴量の組）を保持する。

issue-0157では、そのfeatures（特徴量）から次のprototype（照合用の基準データ）を

- fill-aware prototype
- structure-only control prototype

決定論的に構成できる。

そのため、runtime review（実行時の確認）のためにprototype baseline worksheet（基準ワークシート）を再読み込みしない。

## 6. Profile binding

Profile-backed analysis（承認済みProfileを使う分析）へ渡す前に、approved Profile object（プロファイル本体）とEnvelope ref（Envelope内の参照情報）を照合する。

照合する項目は次のとおり。

- id / count / duplicate
- label
- featureVersion
- sourceProfileId
- sourceEvidence
- baselineSourceDigest
- approvalReference
- approved status

Envelope refはreview surface（人による確認向けのデータ）のための軽量なidentity（識別情報）であり、Format Profile本体はcanonical featuresを保持する資産である。

両者の一致を確認してからanalysis（分析）を行う。

## 7. Observation binding

Profile-backed analysisはobservation snapshot（観測したワークシートの一時データ）からfill-aware result（塗りつぶし情報も考慮した照合結果）を再計算する。

issue-0154のevidence builder（証拠を生成する処理）が、そのresultをEnvelope Perception（Envelope内の認知結果）へcandidate（候補）単位でbinding（関連付け）する。

そのため、workflow自身には別のmatcher consistency（照合結果の整合性確認）ロジックを持たせない。

## 8. Authorityとの順序

deterministic input validation（決定論的な入力検証）はWorkbook loader（ブックを読み込む処理）より前に行う。

不正なProfileやobservation（観測データ）のためにsource/workbook（参照元やブック）を読み込む必要はない。

Authority workflowはdeterministic evidence（決定論的な確認根拠）がEnvelopeへbindingできた後に呼ぶ。

## 9. Final model

新しいsurface schema（表示データの構造定義）は作らない。

最終出力はissue-0155で定義された次のモデルとする。

```text
UnifiedHumanReviewViewModelV1
├─ proposalIdentity
├─ authority
├─ cognitive
└─ deterministic
```

各domain（意味上の領域）は、それぞれ独立した意味を保つ。

## 10. Status semantics

- Authority satisfied ≠ human approved
- Authority blocked ≠ Cognitive result invalid
- Perception matched ≠ proposal executable
- Judgment proposal-only ≠ apply authority
- deterministic review-relevant ≠ auto reject

overall verdict（全体を一つにまとめた判定）やcombined score（統合評価値）は作らない。

## 11. Serialization boundary

返却データには次の情報を保持しない。

- raw Notation
- raw worksheet cells
- raw Format Profile feature arrays
- expectedReview
- WorkbookData
- resolved absolute path
- source bytes

一方、次の情報は保持する。

- proposal digest
- source digest
- Profile refs
- Authority evidence codes
- Cognitive presentation
- deterministic reason / comparison summary

## 12. Source identity

source identity（参照元の同一性）の生成はissue-0152/0153の責務である。

本workflowはhash（照合値の計算）、containment（参照先が許可範囲内かの確認）、stable read（読み取り前後の同一性確認）を再実装しない。

## 13. 残存制約

observation snapshot自体にはcanonical digest（共通規則で求める内容の照合値）がない。

現在はsource identity、Profile identity、およびfull Perception result binding（認知結果全体との照合）を利用する。

snapshot identity（snapshotそのものの識別情報）をCognitive/Authority schemaへ追加するかどうかは、別Issueで判断する。

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
