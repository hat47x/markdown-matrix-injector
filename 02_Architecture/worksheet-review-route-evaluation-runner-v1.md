# Worksheet Review Route Evaluation Runner v1

## 1. 目的

ground-truth準備状態を確認してからprovider評価を実行し、provider inputとfinal label joinを人手で組み立てない。

```text
Label Corpus
  |
  v
issue-0171 Readiness
  | not ready
  +-----------------> blocked / provider calls = 0
  |
  | ready
  v
issue-0172 Evaluation Packet
  |
  v
Evaluation Observation (4-state fields only)
  |
  v
issue-0161 ClosedChoice Provider Runner
  |
  v
Evaluation Response
  |
  v
issue-0172 Strict Report Join
```

## 2. Readiness first

provider実行より前にexplicit readiness policyを評価する。

default policyは持たない。

blocked resultは:
- readiness summary
- blockers

だけを返す。

packet/provider/reportは生成しない。

## 3. Evaluation Observation

evaluation用Observationはproduction worksheet Observationではない。

```text
kind: worksheet-review-route-evaluation-state
payload:
  classification
  candidateCount
  hasWinner
  noveltyScore
```

caseDigestをprovenance sourceDigestとしてbindingする。

## 4. Why separate from production Observation

production Observationは:
- sheetName
- candidate IDs
- winnerPrototypeId

を内部contractとして持つ。

providerへ実際に必要なのはissue-0165で縮約した4項目stateだけ。

評価packetにはproduction-only identifierを保持しないため、それらを捏造してproduction Observationへ合わせる設計を採らない。

## 5. Provider-neutral runner

runnerはprovider interfaceだけを見る。

external/localの判断はissue-0161へ委譲する。

packet orderで逐次実行し:
- case id
- caseDigest
- outcome

を機械的に対応付ける。

## 6. Jev parity

Jev evaluation adapterはgeneric Jev Choice providerを再利用する。

production providerと共通:
- question semantics
- inspect/routine choices
- choice criteria
- model/provider ID semantics

production-equivalent stateに対してtransportへ渡るrequest全体が同じであることをtestする。

## 7. Ground truth isolation

provider callが完了するまでexpected routeはprovider pathへ入らない。

ground truthはissue-0172 report生成時だけcase idでjoinされる。

## 8. Failure semantics

- readiness blocked: typed blocked result。
- external opt-in missing: existing opt-in error。
- provider/transport malformed response: throw。
- provider exception: throw。
- report join mismatch: issue-0172 fail-closed。

partial success artifactは作らない。

## 9. 非責務

- live Jev transport。
- credentials。
- retry/concurrency policy。
- model comparison。
- threshold tuning。
- deployment decision。
- production UI/routing。
