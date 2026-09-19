# Issue: Executable Proposal review workflowへdeterministic review evidenceを安全に合成する

## Meta
- Type: Feature / Safe orchestration composition
- Status: Done
- Priority: High
- Scope: proposal-bound verified review + deterministic worksheet-format evidence
- Expected verification level: focused unit / composition
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0150 Done
- Depends on: issue-0154 Done
- Related: issue-0152 Source Identity Contract
- Related: issue-0153 Contained Cognitive Observation
- Related: issue-0146 external fill-impact family

## 背景

issue-0150では、Executable Proposal reviewを:

```text
Envelope
 -> Presentation
 -> Authority Evidence
 -> proposal-bound verified review surface
```

の単一entrypointへまとめた。

issue-0154では、fill review reasonを:

```text
Cognitive Signalではない
Authority checkでもない
deterministic comparison evidence
```

として独立artifactへ分離した。

しかし両者はまだ別々の呼出しであり、UIや上位workflowが:

- deterministic analysis
- evidence生成
- proposal review workflow
- overlay attachment

を手作業で組み立てる余地が残っていた。

本Issueでは、このcompositionも安全な単一entrypointへまとめる。

## 設計原則

### 1. Prepared artifactを受け取らない

新workflowは以下をcallerから受け取らない。

- Cognitive Review Presentation
- Authority Receipt
- Authority Evidence
- DeterministicReviewEvidence
- telemetry code list
- expectedReview
- matcher options

callerが与えるdeterministic inputは:

- observation snapshot
- prototype snapshots
- approved Format Profiles

だけ。

reasonは内部で再計算する。

### 2. Evaluation labelをruntime boundaryへ持ち込まない

issue-0139〜0146で使った `expectedReview` は評価corpus用ラベル。

runtime compositionでは使わない。

そのため `worksheetFormatFillReviewTelemetry.ts` に:

```text
analyzeWorksheetFormatFillReviewCase
```

を追加し、`expectedReview`なしで単一caseを解析できるようにする。

既存held-out evaluation APIはこの新APIを内部利用する。

### 3. Prototype poolをEnvelopeへ固定する

deterministic prototype ID集合は:

```text
Envelope visible Profile ID集合
```

と完全一致しなければならない。

- missing
- extra
- duplicate

をfail-closed。

### 4. Prototype snapshotをapproved Profile featuresへ固定する

ID一致だけでは不十分。

callerが同じIDで別snapshotを与える経路を防ぐため:

1. approved Format Profileを検証
2. Envelope Profile refと:
   - id
   - label
   - featureVersion
   - sourceProfileId
   - sourceEvidence
   - baselineSourceDigest
   - approvalReference
   を一致確認
3. prototype snapshotをcurrent fill-aware source profileで再feature化
4. approved Format Profileのcanonical featuresと完全一致確認

をloader実行前に行う。

### 5. Observation側はPerception resultへ再bindingする

observation snapshotから再計算したfill-aware matcher resultがEnvelope Fly Perceptionと:

- classification
- winner
- novelty
- candidate order
- candidate scores

まで一致しなければfail-closed。

prototype featuresも固定するため、deterministic comparison用snapshotを別formatへすり替える余地を大幅に減らす。

### 6. ValidationはAuthority loadより先

順序:

```text
prototype/Profile binding
 -> paired fill analysis
 -> deterministic evidence binding
 -> issue-0150 proposal/Authority workflow
 -> issue-0154 evidence surface validation
 -> UI-neutral flatten
```

deterministic inputが不正ならWorkbook loaderを呼ばない。

## 新しいsurface

```text
ExecutableProposalDeterministicReviewSurfaceV1
├─ proposal
├─ review
│  ├─ Authority boundary display
│  ├─ Perception
│  ├─ optional Judgment
│  └─ provenance
├─ authorityVerification
└─ deterministicReviewEvidence
```

UI-neutralであり、各artifactの意味をflat siblingとして見せる。

重要:

- deterministic reasonはreview内のCognitive evidenceへ移さない
- Authority verificationへ移さない
- proposal identityへ移さない

## Authority blockedとの関係

Authorityがblockedでも:

- Perception
- Judgment
- deterministic review evidence

を改変しない。

例:

```text
Authority:
  blocked(parameter-schema)

Perception:
  matched

Deterministic reason:
  fill-supported-acceptance
```

は矛盾ではない。

それぞれ別の問いへ答えている。

- Authority: このproposalは実行前提を満たすか
- Perception: worksheet formatはどう認識されたか
- deterministic reason: fill evidenceがmatcher decisionへどう影響したか

## Source identity

issue-0152 / 0153により:

```text
contained source
 -> canonical source-file-bytes-v1 digest
 -> Cognitive Observation sourceDigest
```

が利用可能。

本workflowはこのdigest生成を再実装しない。

Envelope / Authority / deterministic evidence間のsourceDigest consistencyをissue-0154 contractへ委譲する。

## Non-goals

- production plugin/extension wiring
- UI component
- auto accept / auto reject
- apply authority
- matcher threshold変更
- fill weighting変更
- Cognitive provider変更
- Judgment provider変更
- Authority check追加
- raw worksheet / raw Notationのsurface保持
- generic deterministic reason engine化

## Acceptance criteria

- [x] label-free single-case fill review analysis APIを追加
- [x] existing held-out evaluation behaviorをそのAPIへ委譲
- [x] deterministic evidence APIをlabel-free analysis resultへ広げる
- [x] proposal + deterministic reviewの単一workflowを追加
- [x] with-loader版を追加
- [x] default-loader版を追加
- [x] prepared deterministic evidenceをinputへ含めない
- [x] telemetry codeをinputへ含めない
- [x] matcher optionsをinputへ含めない
- [x] prototype ID集合をEnvelopeへbinding
- [x] approved Profile poolをEnvelope refsへbinding
- [x] prototype snapshot featuresをapproved Profile featuresへbinding
- [x] observation再matchをPerceptionへbinding
- [x] invalid deterministic inputでloaderを呼ばない
- [x] proposal identityをsurfaceへ保持
- [x] Authority verificationをsurfaceへ保持
- [x] Perceptionをsurfaceへ保持
- [x] optional Judgmentをsurfaceへ保持
- [x] provenanceをsurfaceへ保持
- [x] deterministic review evidenceを独立siblingとして保持
- [x] Authority blockedでもdeterministic/Cognitive evidenceを改変しない
- [x] Envelope / snapshotをmutateしない
- [x] serialized surfaceからraw Notation / cells / features / expectedReviewを除外
- [x] write/apply authorityを追加しない
- [x] existing issue-0150 / 0154 schemasを変更しない
- [x] production runtimeを変更しない

## Validation policy

追加testはsynthetic worksheet snapshot + temporary CSV sourceを用いる。

source identityはissue-0153 Contained Cognitive Observation builderを使って作り、Authority sideと同じcanonical digestにする。

focused testで:

- satisfied Authority + review-relevant deterministic reason
- blocked Authority +同じdeterministic reason
- optional Judgment保持
- prototype pool mismatch
- same-id / wrong-feature prototype snapshot
- observation matcher mismatch
- input immutability
- serialization boundary
- default loader path

を固定する。

GitHub Actionsの既知runner/resource不足は完了条件にしない。

現在環境にrepository dependency treeが無い場合はruntime passを主張しない。

## 残存制約

observation snapshotそのものには独立したsnapshot digest contractがまだ無い。

本Issueでは:

- canonical sourceDigest
- approved prototype feature binding
- full primary matcher result binding

で整合性を確認する。

将来、source-derived worksheet snapshotへcanonical digest/identityを持たせる必要が出た場合は別Issueで設計する。現段階でCognitive/Authority contractへ新しいdigest fieldを追加しない。

## 次段階

このcompositionが安定した後は、production wiringではなく:

- UI-neutral presentation ordering
- review reasonの表示優先度
- diagnostic-only reasonの折りたたみ
- Authority blocked時の表示関係

をpure presentation modelとして評価する。

それでもauto decision / apply authorityは導入しない。
