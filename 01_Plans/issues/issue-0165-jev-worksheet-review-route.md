# Issue: MMI固有のJev worksheet review-route Choice contractを実装する

## Meta
- Type: Feature / Provider-specific bounded Judgment
- Status: Done
- Priority: High
- Scope: worksheet review-route choices, minimized Jev state projection, human-review-only route semantics
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0162 Done
- Depends on: issue-0163 Done
- Related: issue-0164 Worksheet Format Observation Identity
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Public API evidence (2026-09-20)

TypeSafe公式APIではChoiceは有限option集合から1つを選び、criteriaで各optionの意味を記述し、choice/probabilities/confidenceを返す。
本Issueはその構造だけを利用する。

参考:
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/primitives/choice

## Problem

issue-0162はgeneric Jev Choice adapterであり、callerがstate projection / Choice criteriaを自由に定義できる。
MMIのworksheet review-routeで毎回これを手書きすると:

- source digestやsheet名など不要情報をstateへ含める
- Profile IDを外部送信する
- routineをaccept/auto-applyの意味で解釈する
- choice criteriaがintegrationごとに変わる

余地がある。

## Decision

MMI固有routeを2択へ固定する。

- inspect: 高い注意度のhuman review
- routine: 通常のhuman review

両方:
- human review required = true
- apply authority = none
- automatic decision = none

routineはaccept / approved / safe-to-applyを意味しない。

## Jev state projection

issue-0163 review-route Observationから外部providerへ送るstateは次だけ。

- classification
- candidateCount
- hasWinner
- noveltyScore

送らない:
- sheetName
- candidate/Profile IDs
- source digest
- feature version
- source profile id
- raw cells
- raw features
- absolute path

## Acceptance criteria

- [x] `WorksheetReviewRouteChoice = inspect | routine` を定義する。
- [x] canonical ClosedChoiceQuestionを定義する。
- [x] route policyをmachine-readableに定義する。
- [x] inspect/routine両方でhuman review requiredを固定する。
- [x] inspect/routine両方でapply authority noneを固定する。
- [x] inspect/routine両方でautomatic decision noneを固定する。
- [x] Jev provider factoryをissue-0162上に実装する。
- [x] projectStateは4つのnon-identifying derived fieldsだけを送る。
- [x] candidate IDs / sheetName / source digestをstateへ送らない。
- [x] providerへ渡すObservation schema/kind/payloadをfail-closed検証する。
- [x] model pin / provider id overrideをgeneric Jev adapterへ委譲する。
- [x] final outcomeはissue-0161/0138経路でproposal-only。
- [x] live network / credentialを追加しない。
- [x] production routingを追加しない。

## Validation plan

- exact projected state shape。
- identifying fields非送信。
- Choice request instructions/criteria。
- inspect/routine policy invariants。
- provider result proposal-only。
- wrong observation kind/schema rejection。
- malformed payload rejection before transport。
- model pin propagation。
- external opt-in gate。
- strict compile。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- MMI固有review-route state / policy / Choice mappingを
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **5 tests / 5 pass / 0 fail**。
- 確認内容:
  - projected Jev stateは `classification / candidateCount / hasWinner / noveltyScore` の4項目のみ。
  - sheet name / candidate ID / source digest / feature versionをstateへ含めない。
  - inspect / routine両routeで `humanReviewRequired=true`。
  - inspect / routine両routeで `applyAuthority=none`。
  - inspect / routine両routeで `automaticDecision=none`。
  - explicit model pinをgeneric Jev adapterへ透過。
  - canonical review-route Observation以外をprovider transport前に拒否。
  - noveltyScore等のmalformed payloadをtransport前に拒否。
- repository test sourceではissue-0161 runnerまで通し、Choice request instructions/criteria、proposal-only outcome、external opt-in gate、provider id/model provenanceを追加検証。
- review-route `routine` はaccept / approved / safe-to-applyを意味しないことをpolicyとcriteriaの両方へ固定。
- live Jev network / credential / threshold / production routingは追加していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
