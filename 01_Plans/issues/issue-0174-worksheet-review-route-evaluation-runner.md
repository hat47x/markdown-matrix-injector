# Issue: Readiness-gated worksheet review-route evaluation runnerを実装する

## Meta
- Type: Evaluation execution / Provider parity
- Status: Done
- Priority: High
- Scope: readiness gate, provider-neutral packet execution, evaluation Observation, Jev production/evaluation parity
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0161 Done
- Depends on: issue-0165 Done
- Depends on: issue-0171 Done
- Depends on: issue-0172 Done
- Related: issue-0173 Resume-safe Annotation Work Allocation
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0171でground-truth corpusのreadinessを判定でき、issue-0172でprovider-visible projection packetとstrict report joinを定義できる。

しかし両者が別APIのままだと:
- readiness未達のcorpusでproviderを実行する
- packetから手作業でprovider callを組み立てる
- caseDigestとoutcomeを取り違える
- external provider opt-inをintegrationごとに実装する
- Jev評価時だけproductionとは異なるstate/criteriaを使う

余地がある。

特にproduction用Jev providerはcanonical review-route ObservationのsheetName/candidateIdsを受け取る一方、評価packetは意図的にそれらを保持しない。
評価のために偽のsheet名やcandidate IDを生成してはいけない。

## Decision

provider-neutralな `runWorksheetReviewRouteEvaluation` を追加する。

順序:

1. explicit readiness policyをissue-0171で評価。
2. not readyなら `status=blocked` を返しproviderを呼ばない。
3. readyならissue-0172 evaluation packetを生成。
4. packet caseごとにevaluation専用 `CognitiveObservation` を生成。
5. issue-0161 provider runnerでclosed-choice Judgmentを実行。
6. packet caseDigestとoutcomeを自動でresponseへbinding。
7. issue-0172 strict evaluatorでfinal reportを生成。

## Evaluation Observation

Observation:
- id = case id
- kind = `worksheet-review-route-evaluation-state`
- schemaVersion = `worksheet-review-route-evaluation-state-v1`
- payload:
  - classification
  - candidateCount
  - hasWinner
  - noveltyScore
- provenance.sourceKind = `worksheet-review-route-evaluation-packet`
- provenance.sourceDigest = caseDigest

含めない:
- expectedRoute
- evidence
- annotation/adjudication
- sheetName
- candidate/Profile IDs
- raw features/cells

payloadはexact-key validationする。

## Provider execution

runnerは `ClosedChoiceJudgmentProvider<WorksheetReviewRouteChoice>` を注入で受け取る。

- local providerはそのまま実行可能。
- `external-opt-in` providerは既存issue-0161のexplicit opt-inをそのまま要求。
- executionはpacketのcanonical case順に逐次実行。
- provider exceptionはpartial reportへ変換せず、そのrun全体を失敗させる。
- non-decision outcomeは通常のoutcomeとしてissue-0172 responseへ含められる。

## Jev evaluation adapter

`createJevWorksheetReviewRouteEvaluationProvider` を追加する。

production Jev providerと共有するもの:
- canonical question
- choice descriptions / criteria
- model/provider option semantics
- generic Jev Choice adapter

異なるのはstate projectionだけ。

evaluation adapterはevaluation Observationの4項目stateをそのままJev stateへ投影する。

production-equivalent stateに対して:
- state
- model
- question instructions
- choice criteria

がproduction providerと完全一致することをparity testで固定する。

## No fabricated production identifiers

evaluation Observationをproduction Observationへ偽装しない。

禁止:
- fake sheetName
- synthetic candidate IDs
- synthetic winnerPrototypeId

これらはproviderへ送られない情報を再発明するため、評価の再現性を悪化させる。

## Acceptance criteria

- [x] readiness policyをrunner引数で必須化。
- [x] readiness not-ready時はprovider call 0。
- [x] ready時のみevaluation packetを生成して実行。
- [x] evaluation Observation schema/kindを固定。
- [x] Observation payloadを4項目exact stateへ限定。
- [x] caseDigestをObservation provenanceへbinding。
- [x] expectedRoute/evidence/annotation/adjudicationをprovider Observationへ含めない。
- [x] packet caseDigestとoutcomeを自動response化。
- [x] issue-0172 strict evaluatorからreport生成。
- [x] local providerで完走。
- [x] external providerはexplicit opt-in必須。
- [x] provider exceptionでpartial reportを返さない。
- [x] corpus/readiness policyをmutateしない。
- [x] production Choice criteriaをhelperとして共有。
- [x] Jev evaluation providerをgeneric Jev adapter上に実装。
- [x] Jev production/evaluation request parityを固定。
- [x] fake sheetName/candidate IDsを作らない。
- [x] live network/API key/retryを追加しない。
- [x] production routing/apply authorityを変更しない。

## Validation plan

- blocked corpus / zero provider calls。
- ready local provider / complete response+report。
- provider-visible Observation non-disclosure。
- external opt-in gate。
- immutability。
- malformed evaluation state rejection。
- extra state field rejection。
- Jev request parity。
- exact four-field Jev state。
- no production identifier leakage。
- strict compile。


## Validation evidence

### 2026-09-21 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上の0174実装4module:
  - `worksheetReviewRouteEvaluationObservation.ts`
  - `worksheetReviewRouteEvaluationRunner.ts`
  - `jevWorksheetReviewRouteEvaluationProvider.ts`
  - Choice criteria helperを共有化した `jevWorksheetReviewRouteProvider.ts`
  を、公開interface互換の最小stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime: **6 groups pass / 0 fail**。
  1. `requireProjectionForAllAdjudicated=true` を明示しないpolicyをprovider call前にreject。
  2. readiness blocked corpusではprovider call 0。
  3. local providerでcompleted result / issue-0172 style reportを生成し、provider ObservationにexpectedRoute / evidence / annotations / adjudication / annotatorRef / adjudicatorRef / evidence factsが入らないことを確認。
  4. `external-opt-in` providerはallowExternalなしでfirst decision前にrejectし、明示opt-in時のみ実行。
  5. production Jev providerとevaluation Jev providerへequivalent stateを与え、transport request全体がdeep-equal。evaluation requestにproduction sheetName / candidate IDを含めない。
  6. evaluation stateにextra fieldを入れた場合、および `candidateCount=0 && hasWinner=true` をfail-closed。
- provider-neutral runnerはpacket case id / caseDigestとoutcomeを機械的にbindingし、manual joinを追加していない。
- fake sheetName / synthetic candidate IDs / synthetic winnerPrototypeIdを生成していない。
- production review-route Choice criteriaはhelper化しただけで意味変更なし。
- live Jev network transport / credentials / retry / concurrency / model selection / threshold tuning / production routing / apply authorityは追加していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
