# Fill review telemetry

この文書は、fill evidenceをreview用の「理由」として観測するときの意味を整理します。

## 1. telemetryはmatcherではない

この層は:

```text
matched / ambiguous / novel
```

を書き換えません。

structure+fillとstructure-onlyを並べて、

> fill evidenceが判定へ何をしたか

を説明します。

## 2. Decision-impact

fillがstatusを変えたケースです。

### supported acceptance

```text
novel -> matched
```

### supported disambiguation

```text
ambiguous -> matched
```

### induced ambiguity

```text
matched -> ambiguous
```

### induced rejection

```text
matched -> novel
```

これらは良い／悪いを意味しません。

「fillがdecision boundaryをまたがせた」という事実です。

## 3. Essential unavailable

次のような候補があるとします。

```text
prototype A:
  structure same
  dark

prototype B:
  structure same
  light
```

observationにfillが無ければ、structureだけでは区別できません。

このとき:

```text
fill-unavailable-for-discrimination
```

を出します。

単なる `fill-unavailable` より狭い意味です。

## 4. Broad availabilityはreview gateにしない

fillが無いだけなら:

- exact structure
- 1 label drift
- source capability差

でも発生します。

held-out 20ケースでは:

```text
precision 0.333333
FPR       0.333333
```

でした。

したがってavailabilityはdiagnostic factです。

## 5. Tone disagreementもreview gateにしない

dark / lightが異なっても、構造が同じならmatcherは十分matchedのままの場合があります。

held-outではtone disagreement単独のreview precisionは0でした。

style driftを即format driftとしません。

## 6. 同じfillでも方向が一定ではない

6列2ラベル差:

```text
structure only novel
with fill      matched
```

8列2ラベル差:

```text
structure only matched
with fill      novel
```

fill feature追加はglobal sparse signatureも変えるため、常にconfidenceを押し上げるわけではありません。

「fill=加点」と考えないでください。

## 7. high-impact reason codes

今回のevaluationでは:

```text
decision-impact
OR
essential-unavailable
```

をhigh-impactとして集計しました。

20ケースではprecision / recallとも1.0でした。

ただしproduction ruleではありません。

synthetic corpusに対する評価結果です。

## 8. 何を一緒にしないか

次を1つのwarningへまとめません。

- fill unavailable
- fill tone differs
- fill changed status
- fill was essential but missing

意味が違うためです。

issue-0128のbalance warningでも、composition telemetryとdecision-boundary warningを混ぜるとノイズが増えました。

同じ原則をfillにも適用します。

## 9. Cognitive Contractとの関係

このtelemetryをCognitive Contractへ接続する変更は本Issueでは行いません。

将来露出する場合でも:

- deterministic matcher result
- fill impact observation
- cognitive recommendation

を同一objectへ潰さず、provenanceとauthorityを分離する必要があります。

provider境界は別レーンの設計に従います。

## 10. 次に必要な証拠

次はexternal-XLSX / adapter由来snapshotでreason codeを再評価します。

synthetic snapshotでperfectだったこと自体は採用根拠になりません。
