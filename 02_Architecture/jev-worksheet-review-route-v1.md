# Jev Worksheet Review Route v1

## 1. 目的

generic Jev Choice能力を、MMIのworksheet reviewで安全に使える狭いJudgmentへ固定する。

## 2. Choices

```text
inspect
routine
```

これはreview attention routeであり、業務結果の承認判定ではない。

### inspect

通常より注意深いhuman reviewへ回す。

### routine

通常のhuman reviewへ回す。

routineでも:
- humanReviewRequired = true
- applyAuthority = none
- automaticDecision = none

## 3. Minimized external state

Jevへ送るのは次のderived stateのみ。

```json
{
  "classification": "matched | ambiguous | novel",
  "candidateCount": 0,
  "hasWinner": false,
  "noveltyScore": 0.0
}
```

意図的に除外は次のとおりです。
- sheet name
- Profile/candidate id
- source digest
- workbook path
- raw cells
- raw feature vector

issue-0163のreview-route Observation自体よりさらに縮約する。

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

Jev confidence/probabilities areprovider-reported Judgment metricsとして保持する。
route自動化のthresholdには使わない。

## 7. 非責務

- auto accept/reject
- apply authorization
- production UI ordering
- live transport
- provider credential
- threshold
- retry/fallback
