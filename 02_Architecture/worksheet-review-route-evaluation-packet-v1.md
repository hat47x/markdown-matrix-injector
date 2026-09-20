# Worksheet Review Route Evaluation Packet v1

## 1. 目的

providerにground truthを見せずにreview-route outcomeを生成できるinput contractと、そのoutcomeをadjudicated labelsへstrict joinするevaluation boundaryを定義する。

    adjudicated label corpus
           |
           | projection state only
           v
    blinded evaluation packet
           |
           | external provider run
           | (outside this module)
           v
    packet-bound outcomes
           |
           +-------------------+
           |                   |
           v                   v
    current final labels   packet digest
           |                   |
           +---------+---------+
                     v
             strict evaluation join
                     |
                     v
             issue-0167 metrics

## 2. Provider-visible packet

packet case:

    {
      id,
      state: {
        classification,
        candidateCount,
        hasWinner,
        noveltyScore
      }
    }

packetはexpected routeを持たない。

evidence / annotation / adjudicationも持たない。

provider/model identityやprior outputも持たない。

## 3. Canonical question

packetは `WORKSHEET_REVIEW_ROUTE_QUESTION` のcopyを持つ。

provider execution側が:
- 同じquestion id
- 同じsemantics
- inspect/routine choices

を利用できるようにする。

本moduleはproviderを実行しない。

## 4. Packet digest

provider input identity:

    worksheet-review-route-evaluation-packet-v1

SHA-256 input:
- representation
- labeling protocol
- question
- sorted case projection states

final labelは含めない。

## 5. Why labels are excluded

label correctionとprovider input correctionは別の変更。

projection stateが同じでexpected routeだけ修正された場合:
- providerが見た入力は同じ
- provider inference resultは再利用可能
- evaluation resultは新しいlabelで再計算すべき

よってprovider packet digestとground-truth digestを分ける。

## 6. Ground truth identity

    worksheet-review-route-ground-truth-v1

input:
- representation
- labeling protocol
- packetDigest
- sorted case id + expected route

これはevaluation label集合のidentity。

adjudicator identity / rationale / provenance全体のidentityではない。

詳細監査はlabel corpusを参照する。

## 7. Response completeness

response case setはpacket case setと完全一致必須。

禁止:
- subsetだけ評価
- unknown case追加
- duplicate case

silent partial evaluationを避ける。

## 8. Provider consistency

1 report = 1 provider descriptor。

provider key:
- id
- version
- category
- executionBoundary
- sorted capabilities

異なるprovider/model resultを1 summaryへ混ぜない。

## 9. Question identity

signal outcomeはcanonical worksheet review-route question idを持つこと。

non-decisionにはquestion payloadがないため適用しない。

## 10. Evaluation reuse

新metricsを作らない。

既存:
- `evaluateWorksheetReviewRouteOutcomes`
- `analyzeWorksheetReviewRouteProjectionSeparability`

を呼ぶ。

issue-0167をmetric semanticsの正本とする。

## 11. Immutability

packet creation / response evaluationは:
- corpus
- response
- outcomes

をmutateしない。

reportは新しいobject。

## 12. 非責務

- provider call
- Jev transport
- model selection
- retry
- storage
- human annotation/adjudication
- runtime review policy
- apply authority
