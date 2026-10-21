# Jev Worksheet Review Route v1

## 1. 目的

generic Jev Choice（選択肢から回答する汎用機能）を、MMIのworksheet review（ワークシートの人手確認）に使う限定的なJudgment（判断候補）へ対応付ける。

## 2. Choices

```text
inspect
routine
```

この2つはreview attention route（人が確認するときの注意の振り分け先）であり、業務結果の承認・不承認を決めるものではない。

### inspect

通常より注意深いhuman review（人による確認）へ回す。

### routine

通常のhuman review（人による確認）へ回す。

routineでも:
- humanReviewRequired = true
- applyAuthority = none
- automaticDecision = none

## 3. Minimized external state

Jevへ送るのは、derived state（観測情報から必要な項目だけを取り出した状態）のみとする。

```json
{
  "classification": "matched | ambiguous | novel",
  "candidateCount": 0,
  "hasWinner": false,
  "noveltyScore": 0.0
}
```

次の情報は意図的に除外する。
- sheet name
- Profile/candidate id
- source digest
- workbook path
- raw cells
- raw feature vector

issue-0163のreview-route Observation（レビュー経路のための観測データ）よりも、さらに送信項目を絞る。

## 4. Question semantics

question:
```text
Choose the human-review attention route for this worksheet-format observation.
This is not an approval or execution decision.
```

criteria:
- inspect: use higher-attention human review; not rejection
- routine: use standard human review; not acceptance or apply authorization

## 5. Integration

```text
issue-0163 derived Observation
 -> MMI review-route state projector
 -> issue-0162 generic Jev Choice provider
 -> issue-0161 provider runner
 -> issue-0138 proposal-only Judgment
 -> Cognitive Review Envelope
```

## 6. Confidence

Jevが返すconfidence/probabilities（確信度と確率値）は、provider-reported Judgment metrics（提供元が報告した判断指標）として保持する。
これらの値を、route自動化のthreshold（自動的に振り分ける閾値）には使わない。

## 7. 非責務

- auto accept/reject
- apply authorization
- production UI ordering
- live transport
- provider credential
- threshold
- retry/fallback
