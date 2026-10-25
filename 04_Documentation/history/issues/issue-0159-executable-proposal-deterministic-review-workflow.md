# Issue: Profile-backed deterministic reviewをExecutable Proposal workflowへ安全に統合する

## Meta
- Type: Feature / Safe orchestration
- Status: Done
- Priority: High
- Scope: issue-0150 proposal workflow + issue-0157 Profile-backed analysis + issue-0155 unified review model
- Expected verification level: focused unit / composition
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0150 Done
- Depends on: issue-0154 Done
- Depends on: issue-0155 Done
- Depends on: issue-0156 Done
- Depends on: issue-0157 Done
- Related: issue-0158 Contained Worksheet Format Perception
- Related: issue-0152 Source Identity Contract
- Related: issue-0153 Contained Cognitive Observation
- Related: issue-0146 external fill-impact family

## 背景

issue-0150でExecutable Proposal reviewは安全な単一entrypointへ集約された。

issue-0154でdeterministic fill review reasonはCognitive / Authorityと分離された。

その後、並行レーンでは次のとおりです。

- issue-0155: Proposal / Authority / Cognitive / Deterministicを分離した `UnifiedHumanReviewViewModelV1`
- issue-0156: `expectedReview` に依存しないlabel-free fill review analysis
- issue-0157: approved Format Profileだけからstructure+fill / structure-only比較を行うProfile-backed analysis

がmainへ統合された。

本Issueではこれらを再実装せず、**1つの安全なorchestration entrypointで順に呼び出す**。

## 目的

callerが以下を個別に組み立てなくてよいようにする。

```text
approved Format Profiles
 + observation snapshot
 + Cognitive Review Envelope
 + raw executable proposal
        |
        v
Profile-backed deterministic analysis
        |
        v
DeterministicReviewEvidenceV1
        |
        v
issue-0150 Executable Proposal verified workflow
        |
        v
issue-0154 deterministic evidence attachment
        |
        v
issue-0155 UnifiedHumanReviewViewModelV1
```

最終出力は新しいreview schemaを作らず、issue-0155の既存view modelを返す。

## 入力契約

新しいdeterministic input:

```text
observationSnapshot
approvedProfiles
```

受け取らないもの。

- prototype baseline snapshots
- `expectedReview`
- telemetry code list
- prepared `DeterministicReviewEvidenceV1`
- prepared Cognitive Presentation
- prepared Authority Receipt / Evidence
- matcher options

### なぜprototype snapshotを受け取らないか

issue-0157でapproved Format Profileのcanonical featuresからcontrol prototypeを決定論的に作れるようになった。

したがってruntime reviewのためにbaseline worksheet snapshotを再保持する必要はない。

これはは次のとおりです。

- state量削減
- same-id / wrong-snapshot差し替え経路の削除
- Profileをruntime format identityの正本として扱う

という利点がある。

## Approved Profile binding

callerから渡されたapproved ProfilesはEnvelopeのProfile refsと一致しなければならない。

確認は次のとおりです。

- profile count
- duplicate id
- id
- label
- featureVersion
- sourceProfileId
- sourceEvidence
- baselineSourceDigest
- approvalReference
- status = approved

不一致ならdeterministic analysis前にfail-closed。

## Observation binding

issue-0157のProfile-backed analysisはobservation snapshotをapproved Profile群に対して再matchする。

そのresultはissue-0154 `createWorksheetFormatDeterministicReviewEvidence` に渡され、EnvelopeのFly Perceptionと:

- classification
- novelty
- winner
- candidate count
- candidate order
- confidence
- deviationScore
- sparseSimilarity
- featureSimilarity
- source profile / feature version

が一致しなければfail-closed。

これにより、別observation snapshot由来のdeterministic reasonを同じreviewへ誤結合しにくくする。

## Authority loaderより前に止める

順序は次のとおりです。

```text
approved Profile / Envelope ref binding
 -> issue-0157 Profile-backed analysis
 -> issue-0154 Perception binding
 -> issue-0150 proposal + Authority workflow
 -> issue-0154 attachment validation
 -> issue-0155 unified view model projection
```

deterministic inputが不正ならWorkbook loaderを呼ばない。

## 出力

返す型は次のとおりです。

```text
UnifiedHumanReviewViewModelV1
```

4 domain:

```text
proposalIdentity
authority
cognitive
deterministic
```

本Issue専用のflat surface schemaは作らない。

### Authority blockedでも生成可能

Authorityがblockedでも:

- Cognitive Perception
- optional Judgment
- deterministic reason

は別domainの事実として保持する。

例は次のとおりです。

```text
Authority:
  blocked(parameter-schema)

Cognitive:
  matched

Deterministic:
  fill-supported-acceptance
```

これは矛盾ではない。

## Source identity

source identity生成はissue-0152/0153の責務。

本workflowはhashやcontainmentを再実装しない。

issue-0150 / 0154 / 0155の既存bindingを利用する。

## Non-goals

- production UI / extension wiring
- auto accept / auto reject
- apply authority
- overall score / overall verdict
- matcher threshold変更
- fill weighting変更
- Judgment provider変更
- Authority check追加
- raw worksheet / raw Notation保持
- generic deterministic reason engine
- snapshot identity contract新設

## Acceptance criteria

- [x] issue-0157 Profile-backed analysisを利用する
- [x] issue-0156 classifierを再実装しない
- [x] baseline prototype snapshotをruntime inputから除外
- [x] approved Profile poolをEnvelope refsへbinding
- [x] observation analysis結果をPerceptionへbinding
- [x] prepared deterministic evidenceをinputへ含めない
- [x] telemetry codeをinputへ含めない
- [x] `expectedReview` をinputへ含めない
- [x] matcher optionsをinputへ含めない
- [x] invalid deterministic inputでWorkbook loaderを呼ばない
- [x] issue-0150 workflowを再利用
- [x] issue-0154 attachment validationを再利用
- [x] issue-0155 UnifiedHumanReviewViewModelを最終出力に使う
- [x] satisfied Authorityを保持
- [x] blocked Authorityでもview modelを生成
- [x] optional Judgmentを保持
- [x] source/proposal/provenanceを保持
- [x] deterministic reasonを独立domainとして保持
- [x] overall verdictを作らない
- [x] Envelope / Profile / observation snapshotをmutateしない
- [x] serialized modelへraw Notation / cells / full features / evaluation labelを保存しない
- [x] production runtimeを変更しない

## Focused test

追加testはtemporary CSV + synthetic worksheet observation + approved Format Profileを使う。

固定するケースは次のとおりです。

1. satisfied Authorityから4-domain Unified view modelを生成
2. blocked AuthorityでもCognitive / deterministic domainを維持
3. Envelopeと異なるapproved Profile poolをloader前に拒否
4. baseline provenanceが異なるProfileをloader前に拒否
5. observation再matchとPerceptionが異なる場合をloader前に拒否
6. Envelope / Profile / observation snapshot不変
7. serializationにraw Notation / cells / features / expectedReview / overall score / apply semanticsを含めない
8. normal dependency環境向けdefault-loader経路

## 並行レーンとの調整

この作業は当初issue-0155として開始したが、作業中に以下が先行してmainへ統合された。

- issue-0155 Unified Human Review View Model
- issue-0156 Fill Review Analysis Contract
- issue-0157 Profile-backed Fill Review Analysis
- issue-0158 Contained Worksheet Format Perception

その都度同じ作業ブランチへmainを取り込み、重複実装を削除した。

最終採番は**issue-0159**。

branchを追加分岐せず、同じ `feature/proposal-deterministic-review-workflow` を継続利用する。

## Validation policy

GitHub Actionsの既知runner/resource不足は完了条件にしない。

現在環境にrepository dependency treeが無い場合はrepository全test passを主張しない。

公開API整合、focused orchestration boundary、diff / concurrency状態を確認したうえで統合する。

## 残存制約

observation snapshotには独立したcanonical snapshot identityはまだ無い。

現時点ではは次のとおりです。

- canonical source identity
- approved Profile identity
- full Perception result binding

で誤結合を防ぐ。

snapshot identity自体を必要とする場合は別contractとして検討する。


## issue-0158との境界

issue-0158はcontained sourceからstable Observation + Fly Perceptionまでを1本化する。

本IssueはそのPerceptionを含むCognitive Review Envelopeを受け取った後のreview orchestrationであり、snapshot reader / containment / source read windowは再実装しない。

issue-0158はraw WorksheetFormatSnapshotをreturn artifactへ保持しないため、本IssueのProfile-backed deterministic analysisには引き続きobservation snapshot入力が必要である。

このsnapshotはissue-0154のfull Perception result bindingで照合する。snapshot自体へ新しいcanonical digestを追加することは本Issueのscope外とする。


## Validation evidence

### 2026-09-20 reconciliation validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0150 / 0154 / 0155 / 0157の公開APIとinterface-compatibleな境界でworkflow本体を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **9 checks / 9 pass / 0 fail**。
- 確認内容は次のとおりです。
  - valid Profile-backed deterministic inputからAuthority loaderを1回だけ呼び、satisfied 4-domain modelを生成。
  - Authority blockedでもCognitive / deterministic domainを保持。
  - Envelopeと異なるapproved Profile poolをloader呼出前にfail-closed。
  - observation再matchがPerceptionと異なる場合をloader呼出前にfail-closed。
  - input Envelope / Profile / observation snapshotをmutateしない。
  - deterministic reasonを独立domainとして保持し、overall verdictを生成しない。
- reconciliation時のstrict compileで、先行branchにあったconditional type guardの改行構文がTypeScript 5.8.3でparse errorになることを検出し、`'deterministicReviewEvidence' extends ...` 形式へ修正済み。
- baseline prototype snapshot / `expectedReview` / telemetry / matcher options / prepared evidenceをruntime inputへ戻していない。
- issue-0158 Contained Worksheet Format Perceptionがmainへ先行統合されたため、本Issueは0159へ改番し、両者の責務境界を文書化。
- production runtime / matcher / provider / Authority semantics / UIは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
