# Issue: Worksheet format observation identityでPerceptionとdeterministic reviewをbindingする

## Meta
- Type: Feature / Derived-state integrity binding
- Status: Done
- Priority: High
- Scope: Fly Perception payload + review Envelope provenance + low-level deterministic review binding
- Expected verification level: unit + focused composition
- Production runtime: 変更しない

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0158 Done
- Depends on: issue-0159 Done
- Related: issue-0160 Contained Unified Review Workflow
- Parallel exclusion: matcher scoring / feature extraction semantics / Authority / production UIは変更しない

## Problem

issue-0160のsafe orchestrationは、stable read window内で取得した同じWorksheet snapshot objectをPerceptionとdeterministic analysisへ内部供給するため、上位callerによるsnapshot取り違えを防いでいる。

一方、低レベルのissue-0159 workflowは再利用可能APIとしてCognitive Review Envelopeとobservation snapshotを別々に受ける。

issue-0154はfill-aware matcher resultをFly Perceptionへcandidate単位で再bindingするため、誤結合リスクは既に低い。

ただしmatcher outputはderived stateのlossyな投影であり、異なるformat feature stateが偶然同じcandidate score / statusへ写る可能性までidentityとして保証するものではない。

また、Perception artifact単体から「どのderived format stateを見たか」をraw feature vectorなしで再照合できる明示contractがない。

## 決定

WorksheetFormatObservationIdentityV1 を追加する。

これはsource file identityではなく、worksheet matcherが実際に比較したderived format featuresのidentityである。

### identity input

canonical digest input:

    representation
    sourceDigest
    featureVersion
    sourceProfileId
    normalized sourceEvidence
    normalized comparedFeatures

digest algorithm:

    sha256

representation:

    worksheet-format-compared-features-v1

### artifact fields

    schemaVersion
    role = worksheet-format-observation-identity
    algorithm
    representation
    digest
    sourceDigest
    featureVersion
    sourceProfileId
    sourceEvidence

raw featuresはartifactへ保存しない。

## Semantics

### 同じidentityになるもの

body cell値だけが変化し、現在のformat adapterが観測するformat featuresが同じ場合。

これは意図的。本identityはdata-content identityではなくformat observation identityだからである。

### identityが変わるもの

現在のcompared feature stateを変える変更。

例:
- header label
- header fill
- title/header/body skeleton
- occupancy
- recurring merge shape
- current source profile
- feature version
- source digest

## Source identityとの違い

issue-0152:

    SourceIdentityV1 = source-file-bytes-v1

issue-0163:

    WorksheetFormatObservationIdentityV1
    = worksheet-format-compared-features-v1

前者はfile bytesのidentity。後者はCognitive Perceptionが利用したderived format stateのidentity。置換関係ではない。

## Privacy境界

identityはhashであり、raw cells / raw feature vectorをartifactへ保持しない。

ただしhashを機密化・匿名化・暗号学的秘匿とは扱わない。header label等が低entropyの場合、digestからの推測可能性を完全には排除しない。

したがって:
- external providerへ自動送信しない
- human-review presentationへ既定表示しない
- privacy policyの代替にしない

ADR-0018 D8を維持する。

## Fly Perception binding

FlyWorksheetFormatPerceptionPayload に observationIdentity を追加する。

identityは既存matcher resultのcomparedFeatures / featureVersion / sourceProfileId / sourceEvidenceとObservation sourceDigestから生成する。

matcher score / threshold / rankingは変更しない。

## Envelope validation

createCognitiveReviewEnvelope でPerception identityを再検証する。

照合:
- sourceDigest
- featureVersion
- sourceProfileId
- sourceEvidence
- schema / role / algorithm / representation / digest syntax

これにより、Perception payloadへ別identityを差し込んだ状態でreview Envelopeへ昇格しにくくする。

## issue-0159 binding

low-level deterministic review workflowはProfile-backed analysis前に:

    observation snapshot
      -> current source profileでfeature抽出
      -> observation identity再計算
      -> Envelope Perception identityと比較

を行う。

不一致ならAuthority Workbook loaderを呼ばずfail-closed。

その後も既存issue-0154のfull candidate score bindingを維持する。

つまりderived-state identity binding + matcher-result bindingの二層になる。

## issue-0160との関係

issue-0160はsame snapshot objectを内部共有するため、このidentityがなくてもcallerによるsnapshot取り違えを構造的に防ぐ。

issue-0163はissue-0160を置き換えない。

役割:
- issue-0160: safe orchestration by construction
- issue-0163: explicit derived-state provenance / defense in depth

issue-0160経由でもFly Perceptionにidentityは付与され、Envelope検証とissue-0159内部照合を通る。

最終UnifiedHumanReviewViewModelへidentityは投影しない。

## Non-goals

- exact Workbook snapshot hash
- cell data identity
- source file identity置換
- matcher変更
- source profile変更
- feature version変更
- external provider送信
- UI表示
- auto accept / auto reject
- Authority check追加
- apply authority
- production wiring

## Acceptance criteria

- [x] WorksheetFormatObservationIdentityV1 を追加
- [x] SHA-256 + representation versionを固定
- [x] match resultからidentity生成可能
- [x] snapshot + source profileから同じidentityを再計算可能
- [x] normalized compared featuresだけをdigest inputに使用
- [x] raw featuresをartifactへ保持しない
- [x] body valueだけの変更ではidentityを変えない
- [x] header/fill等のformat changeでidentityを変える
- [x] sourceDigestをidentityへbinding
- [x] Fly Perception payloadへidentityを追加
- [x] Cognitive Review Envelopeでidentity provenanceを検証
- [x] issue-0159 workflowでsnapshot identityをloader前に再照合
- [x] identity mismatchでAuthority loaderを呼ばない
- [x] issue-0160 final human-review modelへidentityを表示しない
- [x] matcher score / threshold / feature semanticsを変更しない
- [x] production runtimeを変更しない

## Validation plan

- match-derived identity == snapshot-derived identity
- body values only change -> same digest
- header change -> different digest
- fill change -> different digest
- sourceDigest change -> different digest
- provenance mismatch rejection
- snapshot mismatch rejection
- Perception payload identity presence
- tampered Perception identity rejected by Envelope
- issue-0159 identity mismatch rejected before Authority loader
- contained issue-0158 path produces bound identity
- issue-0160 final serialization excludes identity/raw features
- strict compile

## Concurrent reconciliation

作業中にJudgmentレーンが先行し、mainで次が確定した。

- issue-0161 Closed-choice Judgment Provider Port
- issue-0162 Jev Choice Transport Adapter

両Issueはclosed-choice Judgment / transport境界を扱い、本Issueのworksheet format observation identityとは変更ファイル・責務が重ならない。

採番だけを譲り、本Issueは最終的に**issue-0163**へ移した。branchは追加分岐せず、同じ `feature/worksheet-observation-identity` を継続利用する。

## Validation policy

GitHub Actionsの既知runner/resource不足は完了条件にしない。

repository dependency treeが無い場合はrepository全test passを主張せず、strict compile / focused harness / source-level contract inspectionを記録する。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- `WorksheetFormatObservationIdentityV1` 本体を、実公開型とinterface-compatibleな最小stubsで
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **4 checks / 4 pass / 0 fail**。
  - match由来identityとsnapshot再計算identityが同一digest。
  - source/profile/version/evidence provenance一致を受理。
  - 同一snapshotとのidentity照合を受理。
  - format feature stateが異なるsnapshotをreject。
- source profile idはtrim、evidenceはdedupe/sortしてからidentity化し、matcher側canonicalizationとの不要な差を抑制。
- repository test sourceへ以下を追加・更新:
  - body valueのみ変更ではidentity不変。
  - header / fill変更でidentity変化。
  - sourceDigest変更でidentity変化。
  - artifact serializationにraw feature vector / header labelを含めない。
  - Fly Perception payloadへidentityを保持。
  - Review Envelopeでtampered provenanceをreject。
  - issue-0159でsnapshot/identity mismatchをAuthority loader前にreject。
  - issue-0158 contained Perceptionでcanonical sourceDigestとのbindingを確認。
  - issue-0160 final Unified modelにidentity / raw featuresを既定表示しない。
- issue-0160のsame-snapshot orchestrationはそのまま維持し、本identityを代替安全策にはしていない。
- matcher score / threshold / feature version / source profile semantics / Authority / production UIは変更していない。
- repository dependency treeは現環境に無いため、repository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
