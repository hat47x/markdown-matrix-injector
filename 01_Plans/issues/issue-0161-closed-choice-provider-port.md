# Issue: Closed-choice Judgment providerの実行portとexternal opt-in境界を実装する

## Meta
- Type: Feature / Provider execution boundary
- Status: Open
- Priority: High
- Scope: async provider-neutral closed-choice invocation, external opt-in, input isolation, existing adapter reuse
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0135 Done
- Depends on: issue-0138 Done
- Related: issue-0160 Contained Unified Review Workflow
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel exclusion: live Jev SDK / API key / network / provider account / production UI は導入しない

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

- [ ] async provider-neutral interfaceを追加する。
- [ ] provider category=`judgment` / capability=`closed-choice` をcall前に検証する。
- [ ] Observation / Questionをcall前に検証する。
- [ ] `external-opt-in` providerは明示 `allowExternal=true` がない限りcallしない。
- [ ] local providerはopt-in不要。
- [ ] providerへcaller-owned Observation / Questionそのものを渡さずcloneを渡す。
- [ ] providerがcloneをmutateしてもcaller inputを変えない。
- [ ] provider descriptorをcall前にsnapshotし、call中のdescriptor mutationを結果provenanceへ反映しない。
- [ ] provider responseは既存 `adaptClosedChoiceResponse` を必ず通す。
- [ ] malformed response / undeclared choice / bad distributionは既存adapterでfail-closed。
- [ ] abstained / unsupported / unavailableを正常なnon-decisionとして保持する。
- [ ] provider exceptionをJudgmentへ自動変換せず上位へ伝播する。
- [ ] live Jev SDK / network / credentialを追加しない。
- [ ] production runtime / Notation conformanceを変更しない。

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
