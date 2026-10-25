# Issue: Closed-choice Judgment providerの実行portとexternal opt-in境界を実装する

## Meta
- Type: Feature / Provider execution boundary
- Status: Done
- Priority: High
- Scope: async provider-neutral closed-choice invocation, external opt-in, input isolation, existing adapter reuse
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0135 Done
- Depends on: issue-0138 Done
- Related: issue-0160 Contained Unified Review Workflow
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel exclusion: live Jev SDK / API key / network / provider account / production UIは導入しない

## Problem

issue-0138でclosed-choice Judgmentのtyped response / abstention / calibration contractは固定した。
issue-0160ではoptional `judgmentFactory` からJudgmentをEnvelopeへ渡せる。

ただし現在はprovider invocation自体の共通境界がなく、各integrationが個別に:

- provider descriptor validation
- external送信のopt-in
- Observation / Questionの受け渡し
- provider responseのadapter適用

を実装する余地がある。

## Execution Plan

`closedChoiceJudgmentProvider.ts` を追加する。

provider contract:

```ts
interface ClosedChoiceJudgmentProvider<TChoice> {
  descriptor: CognitiveProviderDescriptor;
  decide(request): Promise<ClosedChoiceProviderResponse<TChoice>>
}
```

runner:

```text
validate Observation
 -> snapshot/validate provider descriptor
 -> validate Question
 -> external-opt-in gate
 -> clone Observation + Question
 -> provider.decide
 -> existing adaptClosedChoiceResponse
 -> ClosedChoiceJudgmentOutcome
```

## Acceptance criteria

- [x] async provider-neutral interfaceを追加する。
- [x] provider category=`judgment` / capability=`closed-choice` をcall前に検証する。
- [x] Observation / Questionをcall前に検証する。
- [x] `external-opt-in` providerは明示 `allowExternal=true` がない限りcallしない。
- [x] local providerはopt-in不要。
- [x] providerへcaller-owned Observation / Questionそのものを渡さずcloneを渡す。
- [x] providerがcloneをmutateしてもcaller inputを変えない。
- [x] provider descriptorをcall前にsnapshotし、call中のdescriptor mutationを結果provenanceへ反映しない。
- [x] provider responseは既存 `adaptClosedChoiceResponse` を必ず通す。
- [x] malformed response / undeclared choice / bad distributionは既存adapterでfail-closed。
- [x] abstained / unsupported / unavailableを正常なnon-decisionとして保持する。
- [x] provider exceptionをJudgmentへ自動変換せず上位へ伝播する。
- [x] live Jev SDK / network / credentialを追加しない。
- [x] production runtime / Notation conformanceを変更しない。

## Validation plan

- local provider decision。
- local provider abstention。
- external provider without opt-in -> provider未呼出。
- external provider with opt-in -> decision。
- wrong category / missing capability -> provider未呼出。
- providerによるObservation/Question clone mutationでcaller input不変。
- provider descriptor mutationでもOutcome provenanceはcall前snapshot。
- malformed provider responseをfail-closed。
- provider exceptionを伝播。
- strict compile。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- provider port + existing closed-choice adapter境界を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **12 checks / 12 pass / 0 fail**。
- 確認内容は次のとおりです。
  - local provider decision -> `proposal-only` Judgment。
  - explicit abstentionをnon-decisionとして保持。
  - `external-opt-in` providerはopt-inなしではcall前に拒否。
  - `allowExternal=true` の場合だけexternal providerを呼ぶ。
  - wrong category / missing capabilityをprovider call前に拒否。
  - providerへ渡すObservation / Question cloneのmutationがcaller inputへ漏れない。
  - provider自身がcall中にdescriptorを変更してもOutcomeはcall前descriptor snapshotを保持。
  - malformed distributionを既存adapterでfail-closed。
  - provider throw/rejectを `unavailable` へ誤変換せず上位へ伝播。
- implementation時の静的照合でQuestion validator定義だけ旧 `assertQuestion` 名が残る不整合を検出し、
  `assertClosedChoiceQuestion` としてexportへ修正済み。
- existing `adaptClosedChoiceResponse` のvalidation semanticsは変更せず、provider / question validatorの可視性だけを上げた。
- live Jev SDK / API key / network / retry / provider account /課金経路は追加していない。
- production runtime / Notation conformance / source write / apply authorityは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
