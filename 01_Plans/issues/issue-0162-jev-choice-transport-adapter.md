# Issue: Jev ChoiceをClosed-choice Judgment provider portへtransport-injectedで接続する

## Meta
- Type: Feature / External provider adapter
- Status: Open
- Priority: High
- Scope: Jev Choice request/response mapping, explicit state projection, option criteria, transport injection
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0138 Done
- Depends on: issue-0161 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel exclusion: API key / fetch実装 / live network / retry / provider account / production UI は導入しない

## Public API evidence (2026-09-20)

TypeSafe公式docsを再確認した。

- endpointは `POST https://api.typesafe.ai/v1/systemone`
- request top-levelは `state / model / questions`
- Choice questionは `type=choice / instructions / criteria`
- `criteria` は option -> string|null map
- response Choice answerは `choice / probabilities / confidence`
- Choice options上限は255

参考:
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/introduction/quickstart

本IssueではHTTP仕様のshapeだけを採用する。
速度・価格・calibration等のvendor claimはMMIの安全保証として利用しない。

## Problem

issue-0161でprovider-neutral async portとexternal opt-in境界を固定した。
次にJevを候補providerとして評価するには、SDKやcredentialをproduction codeへ持ち込む前に:

- MMI Observation -> Jev state
- MMI ClosedChoiceQuestion -> Jev Choice question
- Jev Choice answer -> ClosedChoiceProviderResponse

の写像をローカルstubで固定する必要がある。

## Execution Plan

`jevChoiceJudgmentProvider.ts` を追加する。

adapterは実networkを知らず、transport interfaceだけを呼ぶ。

caller必須:
- `projectState(observation)`
- `describeChoice(choice, question)`

adapter固定:
- provider category = judgment
- executionBoundary = external-opt-in
- capability = closed-choice
- question id = `decision`
- default model = `jev-latest`

## Acceptance criteria

- [ ] issue-0161 `ClosedChoiceJudgmentProvider` を実装する。
- [ ] provider descriptorは `external-opt-in`。
- [ ] state projectorを必須とし、Observation全体を暗黙送信しない。
- [ ] choice criteria projectorを必須とする。
- [ ] Jev request shapeを公式Choice HTTP contractへ固定する。
- [ ] default modelは `jev-latest`。
- [ ] explicit model pinを許容する。
- [ ] Choice 2〜255 optionsをadapter境界で検証する。
- [ ] stateをJSON-compatible string/object/arrayへ限定する。
- [ ] cyclic / undefined / function / symbol / non-finite numberを拒否する。
- [ ] response answer id=`decision`を必須とする。
- [ ] answer `type=choice` を必須とする。
- [ ] choice/probabilities/confidenceをgeneric provider responseへ変換する。
- [ ] probabilitiesの意味検証は既存closed-choice adapterへ委譲する。
- [ ] transport errorを握り潰さない。
- [ ] API key / Authorization header / fetch / retryをadapterへ含めない。
- [ ] live network testを実施しない。

## Validation plan

- request shape mapping。
- state projector利用。
- criteria mapping。
- default / pinned model。
- 255 options受理、256 options拒否。
- invalid state rejection before transport。
- malformed response rejection。
- bad distributionをissue-0138 adapterでfail-closed。
- external opt-in gateとtransport未呼出。
- transport exception伝播。
- strict compile。
