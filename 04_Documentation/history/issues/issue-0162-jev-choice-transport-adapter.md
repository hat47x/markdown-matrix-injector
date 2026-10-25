# Issue: Jev ChoiceをClosed-choice Judgment provider portへtransport-injectedで接続する

## Meta
- Type: Feature / External provider adapter
- Status: Done
- Priority: High
- Scope: Jev Choice request/response mapping, explicit state projection, option criteria, transport injection
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0138 Done
- Depends on: issue-0161 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel exclusion: API key / fetch実装 / live network / retry / provider account / production UIは導入しない

## Public API evidence (2026-09-20)

TypeSafe公式docsを再確認した。

- endpointは `POST https://api.typesafe.ai/v1/systemone`
- request top-levelは `state / model / questions`
- Choice questionは `type=choice / instructions / criteria`
- `criteria` はoption -> string|null map
- response Choice answerは `choice / probabilities / confidence`
- Choice options上限は255

参考は次のとおりです。
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

- [x] issue-0161 `ClosedChoiceJudgmentProvider` を実装する。
- [x] provider descriptorは `external-opt-in`。
- [x] state projectorを必須とし、Observation全体を暗黙送信しない。
- [x] choice criteria projectorを必須とする。
- [x] Jev request shapeを公式Choice HTTP contractへ固定する。
- [x] default modelは `jev-latest`。
- [x] explicit model pinを許容する。
- [x] Choice 2〜255 optionsをadapter境界で検証する。
- [x] stateをJSON-compatible string/object/arrayへ限定する。
- [x] cyclic / undefined / function / symbol / non-finite numberを拒否する。
- [x] response answer id=`decision`を必須とする。
- [x] answer `type=choice` を必須とする。
- [x] choice/probabilities/confidenceをgeneric provider responseへ変換する。
- [x] probabilitiesの意味検証は既存closed-choice adapterへ委譲する。
- [x] transport errorを握り潰さない。
- [x] API key / Authorization header / fetch / retryをadapterへ含めない。
- [x] live network testを実施しない。

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


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0161 provider portとのinterface-compatible境界で
  `jevChoiceJudgmentProvider.ts` を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **17 checks / 17 pass / 0 fail**。
- 確認内容は次のとおりです。
  - default `jev-latest` model request。
  - explicit versioned model idをrequest/provider provenanceへ保持。
  - official Choice request shape:
    `state / model / questions.decision.type=choice / instructions / criteria`。
  - state projectorによりObservation全体を暗黙送信しない。
  - `external-opt-in` gateでtransport未呼出。
  - 255 optionsを受理し、256 optionsをtransport前に拒否。
  - non-finite number / cyclic stateをtransport前に拒否。
  - malformed non-choice answerを拒否。
  - invalid probability distributionはissue-0138 adapterへ委譲してfail-closed。
  - transport exceptionをretry/unavailableへ自動変換せず伝播。
- API key / Authorization header / fetch / retry / environment variable / live networkは実装していない。
- provider descriptor `version` はrequestしたmodel id。
  floating aliasをexact model versionとは扱わず、再現性が必要な評価はversioned model id指定を前提とする。
- live Jev呼出は実施していない。
- production runtime / Notation conformance / source write / apply authorityは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
