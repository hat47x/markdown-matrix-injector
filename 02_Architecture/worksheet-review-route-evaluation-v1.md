# Worksheet Review Route Evaluation v1

## 1. 目的

inspect/routine Judgmentを「当たった/外れた」だけでなく、誤り方向・non-decision・probability・state情報量に分解して評価する。

## 2. Label independence

expected routeはprovider output/confidenceを見ずに付与する。

既存のworksheet matcher / fill telemetry testにある `expectedReview` は、そのsignal familyの評価ラベルでありreview-route labelではないため再利用しない。

後続corpusでは:
- provider outputをhidden
- full review factsを根拠に人間または独立規則でlabel
- label provenanceを保存

する。

## 3. Outcome metrics

### decisionCoverage

```text
decision cases / all cases
```

abstained / unsupported / unavailableはdecisionに含めない。

### decisionAccuracy

```text
correct decision / decision cases
```

coverageと分離する。

### unsafeRoutineRate

```text
expected inspect & selected routine
----------------------------------
expected inspect cases
```

review attentionを下げる方向の誤り。

### unnecessaryInspectRate

```text
expected routine & selected inspect
----------------------------------
expected routine cases
```

review effortを増やす方向の誤り。

両者を1つのerror rateへ潰さない。

## 4. Conservative fallback counterfactual

non-decisionをinspectとして扱った場合の仮想metricsも算出する。

これはdeployment ruleではない。

目的は次のとおりです。
- abstentionを安全側へ倒した場合にunsafe routineがどうなるか
- routine caseでどの程度review overheadが増えるか

を比較すること。

## 5. Probability quality

Choice distributionの `P(inspect)` を使いbinary Brier score:

```text
mean((P(inspect) - yInspect)^2)
```

をdecision casesのみで算出する。

0が良い。
confidenceとは別物。

provider confidenceはmeanを記録するだけで、正答率・calibration保証・thresholdには使わない。

## 6. Exact-state separability

現在のJev state:

- classification
- candidateCount
- hasWinner
- noveltyScore

をcanonical JSON keyへ変換し、同じkey内に複数expected routeがあるか調べる。

conflicting groupがあれば、同じstateを入力とする任意のdeterministic mappingでは全caseを正解できない。

corpus上のoracle max correct:

```text
sum(max(inspectCount, routineCount) for each exact state group)
```

oracle max accuracyはproviderの実測精度ではなく、**そのstate representation上の上限診断**。

## 7. Non-goals

- route label作成
- live Jev benchmark
- model比較
- threshold選定
- automatic fallback
- production routing
- apply authority
