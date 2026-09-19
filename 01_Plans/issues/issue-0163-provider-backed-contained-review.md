# Issue: Provider-backed JudgmentをContained Unified Reviewへ安全に統合する

## Meta
- Type: Feature / Async provider orchestration
- Status: Open
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

- [ ] 既存sync judgmentFactory APIを維持する。
- [ ] async provider entrypointを追加する。
- [ ] providerへraw worksheet snapshot/cells/featuresを渡さない。
- [ ] providerへ元のsource Observationではなくreview-route派生Observationを渡す。
- [ ] 派生Observation sourceDigestはsource Observationと一致する。
- [ ] 派生Observationはcandidate scoreのうち必要最小限だけを保持し、raw feature vectorを含めない。
- [ ] external-opt-in gateはissue-0161を再利用する。
- [ ] opt-in拒否時provider未呼出・Authority loader未呼出。
- [ ] provider failure時Authority loader未呼出。
- [ ] malformed provider response時Authority loader未呼出。
- [ ] provider non-decisionも既存Envelope contractで保持可能。
- [ ] provider decisionはproposal-onlyのまま。
- [ ] sourceがprovider待機中に変化した場合、後段Authority source-identityでblockedとなる。
- [ ] same transient snapshotをPerceptionとdeterministic analysisへ利用する。
- [ ] final modelへprovider state/raw Observation/raw snapshotを保持しない。
- [ ] live network / provider SDK / production wiringを追加しない。

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
