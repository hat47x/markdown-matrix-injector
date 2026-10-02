# Issue: Provider-backed JudgmentをContained Unified Reviewへ安全に統合する

## Meta
- Type: Feature / Async provider orchestration
- Status: Done
- Priority: High
- Scope: stable Perception -> derived review-route Observation -> closed-choice provider -> Envelope -> Authority/deterministic unified review
- Expected verification level: unit + focused composition
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0160 Done
- Depends on: issue-0161 Done
- Compatible with: issue-0162 Jev Choice adapter
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0160はsync `judgmentFactory` を持つが、Jev等のproviderはasyncであり、直接接続すると各integrationが:
- Perceptionからprovider stateを作る
- external opt-inを処理する
- provider responseをEnvelopeへbindする
- provider failure時のAuthority I/O停止順を決める
必要がある。

またproviderへsource Observationをそのまま渡すと、将来payload拡張時に不要情報が外部送信候補となる。

## Execution Plan

0160 moduleを後方互換で拡張する。

1. stable source read + Perception生成を内部helperへ抽出。
2. Perceptionからreview-route専用の派生Cognitive Observationを生成。
3. 派生Observationは:
   - sheetName
   - classification
   - candidate ids
   - winner id
   - noveltyScore
   のみを保持。
4. issue-0161 `runClosedChoiceJudgmentProvider` をasync実行。
5. Judgmentを既存 `createCognitiveReviewEnvelope` で再検証。
6. issue-0159へ同一transient snapshotを渡し、最終4-domain modelを返す。

## Acceptance criteria

- [x] 既存sync judgmentFactory APIを維持する。
- [x] async provider entrypointを追加する。
- [x] providerへraw worksheet snapshot/cells/featuresを渡さない。
- [x] providerへ元のsource Observationではなくreview-route派生Observationを渡す。
- [x] 派生Observation sourceDigestはsource Observationと一致する。
- [x] 派生Observationはcandidate scoreのうち必要最小限だけを保持し、raw feature vectorを含めない。
- [x] external-opt-in gateはissue-0161を再利用する。
- [x] opt-in拒否時provider未呼出・Authority loader未呼出。
- [x] provider failure時Authority loader未呼出。
- [x] malformed provider response時Authority loader未呼出。
- [x] provider non-decisionも既存Envelope contractで保持可能。
- [x] provider decisionはproposal-onlyのまま。
- [x] sourceがprovider待機中に変化した場合、後段Authority source-identityでblockedとなる。
- [x] same transient snapshotをPerceptionとdeterministic analysisへ利用する。
- [x] final modelへprovider state/raw Observation/raw snapshotを保持しない。
- [x] live network / provider SDK / production wiringを追加しない。

## Validation plan

- local provider decision。
- local provider abstention。
- external provider opt-in拒否 -> provider/loader未呼出。
- external opt-in許可 -> provider 1回。
- provider throw -> loader未呼出。
- malformed response -> loader未呼出。
- provider request Observationにcells/features/source absolute pathがない。
- provider待機中source mutation -> Authority blocked。
- sync 0160 APIの既存動作維持。
- strict compile。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- provider-backed追加境界をissue-0160 / 0161のinterface-compatible型で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **6 tests / 6 pass / 0 fail**。
- 確認内容は次のとおりです。
  - source Observation + Fly Perceptionからreview-route派生Observationを生成。
  - derived Observationはsource digestを維持し、cells/featuresを含めない。
  - local provider decisionをJudgmentとして取得。
  - external-opt-in providerは明示許可なしでprovider call前に拒否。
  - explicit opt-in時のみprovider call。
  - provider abstentionをnon-decisionとして保持。
  - malformed distributionを既存closed-choice validationでfail-closed。
  - Perceptionとderived Observationのsource digest不一致を拒否。
- repository focused test sourceにはさらに:
  - provider request Observationにraw worksheet / features / absolute pathが無いこと。
  - external opt-in拒否、provider exception、malformed responseでAuthority loader未呼出。
  - provider待機中source mutationを後段Authority source-identityでblocked。
  - final modelにderived provider Observation / raw snapshot / raw Notationを保持しない。
- 既存sync `judgmentFactory` entrypointは削除せず、stable Perception準備helperを共有する形へrefactor。
- provider-specific state projectionはissue-0162等のprovider adapter側に残し、本workflowはprovider-neutral。
- live network / provider SDK / API key / retry / production UIは追加していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
