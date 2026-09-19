# Issue: MMI固有のJev worksheet review-route Choice contractを実装する

## Meta
- Type: Feature / Provider-specific bounded Judgment
- Status: Open
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

- [ ] `WorksheetReviewRouteChoice = inspect | routine` を定義する。
- [ ] canonical ClosedChoiceQuestionを定義する。
- [ ] route policyをmachine-readableに定義する。
- [ ] inspect/routine両方でhuman review requiredを固定する。
- [ ] inspect/routine両方でapply authority noneを固定する。
- [ ] inspect/routine両方でautomatic decision noneを固定する。
- [ ] Jev provider factoryをissue-0162上に実装する。
- [ ] projectStateは4つのnon-identifying derived fieldsだけを送る。
- [ ] candidate IDs / sheetName / source digestをstateへ送らない。
- [ ] providerへ渡すObservation schema/kind/payloadをfail-closed検証する。
- [ ] model pin / provider id overrideをgeneric Jev adapterへ委譲する。
- [ ] final outcomeはissue-0161/0138経路でproposal-only。
- [ ] live network / credentialを追加しない。
- [ ] production routingを追加しない。

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
