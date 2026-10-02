# Multi-family drift evaluation guide

この文書は、worksheet format matcherで「複数種類の差異が同時に起きたとき、どのsignalがreview候補を拾いやすいか」を評価するための手引きです。

production matcherの仕様書ではありません。

## 1. 現在の結論

現時点ではproduction behaviorを変えません。

維持するもの。

- flat scoring
- `minConfidence = 0.7`
- `minWinnerMargin = 0.05`
- worksheet-format-v6
- 既存balance warning
- fail-closed behavior

今回追加したsignalはすべてevaluation-onlyです。

## 2. なぜ別corpusを使うのか

issue-0128では6 / 8 / 10列を使いました。

そのcorpusを見ながら新thresholdを調整すると、同じデータへ合わせ込むことになります。

そこで今回はは次のとおりです。

- 5列
- 7列
- 9列

を使います。

7列表はfillを含めず、structure-only条件です。

これにより、前回とは違うcardinalityとevidence profileで候補signalを再評価します。

## 3. 「review対象」の意味

ここでいうreviewは、

> source workbookを人間が承認する

という意味ではありません。

認識設計者が、

- feature追加でstatusが動きやすくないか
- 複数の独立差異を1つのknown formatへ吸収しすぎていないか
- scorer変更でfalse matchへ寄らないか

を確認すべきケースです。

明確に異なり十分低confidenceの `novel` は、むしろ境界が安定しているためreview不要としています。

## 4. 比較するsignal

### A. Boundary warning

既存のは次のとおりです。

- `confidence-near-gate`
- `winner-margin-near-gate`

です。

特徴は次のとおりです。

- precisionが高い
- gateから離れたmulti-family driftは拾えない

### B. Matched DeviationScore

top candidateが `matched` の場合だけDeviationScoreを見る候補です。

比較値は次のとおりです。

```text
DeviationScore >= 0.18
```

これはproduction thresholdではありません。

明確なnovelに高DeviationScoreが出ることは正常なので、`matched`だけに限定して比較します。

### C. Different-family count

observationとtop prototypeで、feature集合が異なるfamily数を数えます。

例は次のとおりです。

```text
one label rename:
  semantic-label
  relative-position

count = 2
```

これは1つの元変更が2種類の表現に現れているだけです。

さらにoccupancyが変わると:

```text
semantic-label
relative-position
body-occupancy

count = 3
```

となります。

今回の `>= 3` は、

> label由来の2 family以外にも差異がある

という粗いsignalとして評価しています。

### D. Penalizing ablation-family count

各familyをobservation / prototype双方から外し、confidenceが上がるなら、そのfamilyは元の比較でpenalty方向に働いていたとみなします。

```text
confidenceDelta < 0
```

となるfamily数を数えます。

直感的には有望ですが、疎signatureのbucket構成も同時に変わるため、raw family differenceより不安定です。

## 5. Held-out結果

18ケース、review対象9件です。

### Boundary warning

```text
precision 1.000000
recall    0.333333
FPR       0.000000
```

### Matched DeviationScore >= 0.18

```text
precision 1.000000
recall    0.666667
FPR       0.000000
```

### Matched different-family count >= 3

```text
precision 1.000000
recall    0.666667
FPR       0.000000
```

### Matched penalizing-family count >= 3

```text
precision 0.833333
recall    0.555556
FPR       0.111111
```

## 6. DeviationScoreとdifferent-family countは何が違うか

両者は今回同じrecall 0.666667ですが、拾うケースが異なります。

### DeviationScoreが得意

同じfamily内で差異の量が増えるケースです。

9列表で2つのlabelが変わる場合、異なるfamilyは依然として:

- semantic-label
- relative-position

の2つです。

しかしfamily内の差異量が増えるためDeviationScoreは上がります。

### Different-family countが得意

差異の種類が増えるケースです。

9列表では次のとおりです。

- 1 label rename
- recurring merge loss

が重なると、DeviationScoreは `0.171429` で0.18未満です。

しかし異なるfamilyは:

- semantic-label
- relative-position
- merge-shape

の3つなので、family countでは拾えます。

このため両signalは補完関係にあります。

## 7. Ablation countが不安定な具体例

### 5列 one-label rename

実際にfeatureが異なるfamily:

```text
semantic-label
relative-position

differentFamilyCount = 2
```

ところがablationでは:

```text
penalizingFamilyCount = 3
```

となります。

fill family自体に差異はありません。

familyを取り除くことでglobal sparse signatureのbucket構成まで変わるため、confidenceDeltaの符号は「そのfamilyに直接差があるか」と一致しません。

### 9列 label + merge drift

実際の差異は次のとおりです。

```text
semantic-label
relative-position
merge-shape

differentFamilyCount = 3
```

ablation:

```text
penalizingFamilyCount = 1
```

この逆方向の例もあります。

したがってablationは、

> このfamilyを除くとcurrent scorerがどう動くか

を見る診断には使えますが、

> いくつの独立driftがあるか

を数える用途には向きません。

## 8. 組み合わせ結果

### Boundary OR Deviation

```text
precision 1.000000
recall    0.777778
FPR       0.000000
```

### Boundary OR Different-family count

```text
precision 1.000000
recall    0.888889
FPR       0.000000
```

### Boundary OR Deviation OR Different-family count

```text
precision 1.000000
recall    1.000000
FPR       0.000000
```

このcorpusだけでは最後の組み合わせが完全です。

しかし、**ここでproduction ruleへしないことが重要です**。

## 9. なぜperfect resultを採用しないのか

主な理由は次のとおりです。

- 18ケースしかない
- synthetic feature-level fixture
- expectedReviewのケース設計自体が代表パターン中心
- DeviationScore 0.18は比較用候補
- family count 3は現在のtaxonomyに依存
- 今後feature familyが増えるとcount分布が変わる
- real worksheetではheader detectionやsource-profile filteringも入る

perfect metricは「次へ進む価値がある」という証拠であり、「production化してよい」という証拠ではありません。

## 10. 実装を読む順番

1. `flyInspiredFormatMatcher.ts`
2. `worksheetFormatFeatureFamilyAnalysis.ts`
3. `worksheetFormatScoringStrategyComparison.ts`
4. `worksheetFormatBalanceWarningEvaluation.ts`
5. `worksheetFormatMultiFamilyDriftEvaluation.ts`
6. `worksheetFormatMultiFamilyDriftEvaluation.test.ts`
7. issue-0128
8. issue-0129

この順で読むと、production contractとevaluation helperを混同しにくくなります。

## 11. 次に必要なfixture

次はfeature文字列を直接作るだけでなく、`WorksheetFormatSnapshot` からadapterを通します。

含めたい差異は次のとおりです。

- title/header gap
- first body gap
- partial body coverage
- majority occupancy
- recurring merge
- fill有無
- 1〜複数label drift
- multiple prototypes
- metadata preamble

また同じcase familyについて:

- structure + fill
- structure only

の両方を作り、signalがevidence availabilityだけで大きく変わらないかを確認します。

## 12. 変更時の注意

新signalを試す場合も、まずevaluation layerへ追加してください。

production matcherへ直接:

- threshold
- warning
- score補正
- auto-review
- auto-reject

を追加しないでください。

最低でも別corpusで:

- precision
- recall
- false-positive rate
- false negativeの具体例
- source-profile差

を記録してから設計判断へ進みます。
