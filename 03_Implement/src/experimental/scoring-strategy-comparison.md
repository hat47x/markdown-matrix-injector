# Scoring strategy comparison guide

この文書は、worksheet format matcherのscoringを変更したい参画者向けの**評価手順書**です。

目的は、新しいscore式をすぐproductionへ入れることではありません。現在の境界を壊さずに改善できるかを、同じfixture上で比較できるようにすることです。

## 1. 先に結論

2026-09-18時点では、production matcherは現行のflat方式を維持します。

今回比較したは次のとおりです。

- family-normalized
- column-family-capped

はいずれも、既存の6列表near-gate `novel` を `matched` へ反転させました。

したがって「familyごとの重みを均す」「列比例familyをcapする」という直感だけでは、安全な改善になりません。

一方、flat scoreを変えずにwarningだけを追加するbalance gateは、境界を壊さずレビュー対象を表面化できるため、次の評価対象として残します。

## 2. 何を比較しているか

### production flat

現在のmatcherは、全featureを1集合として扱います。

```text
feature similarity = Jaccard(all features)
confidence
  = feature similarity * 0.7
  + sparse similarity  * 0.3
```

ここでfamilyごとの明示weightはありません。

そのため、feature数が多いfamilyほど結果への影響が大きくなりやすいです。

### family-normalized

featureをfamilyに分け、各familyのJaccardを等重みで平均します。

イメージは次のとおりです。

```text
labels       0.50
positions    0.50
skeleton     1.00
occupancy    1.00
fill         1.00

family feature similarity
  = average(...)
```

family内feature数が2件でも10件でも、family全体として1票に近い扱いになります。

### column-family-capped

`semantic-label` と `relative-position` の寄与だけを一定数で頭打ちにする試験方式です。

今回の比較値はcap=3です。

これは採用値ではありません。

「wide tableで列比例featureが増え続けるのを止めたらどうなるか」を見るための実験パラメータです。

### flat + balance gate

score式は変えません。

代わりに、次のような状態をwarningとして返します。

- confidenceがacceptance gateの近くにある
- winner marginがambiguity gateの近くにある
- 列比例familyがfeature全体の過半数を占める
- 1 familyが過度に大きい

重要なのは、warningが出ても `matched / ambiguous / novel` は変わらないことです。

## 3. なぜoffline専用なのか

scoring変更はfeature追加より影響範囲が大きいです。

featureを1件追加する場合は、そのfeatureがあるケースだけが主に動きます。

score式を変更すると、既存prototypeと既存observationの**すべての組み合わせ**が動く可能性があります。

そのため、

`worksheetFormatScoringStrategyComparison.ts`

はproduction経路へ接続しません。

このファイルは「別matcher」ではなく、候補式を比較するための測定器です。

## 4. 最初に見る反例

もっとも重要なのは6列表2ラベル変更です。

### prototype

```text
ID | 項目 | 判定 | 確認者 | 備考 | 期限
```

### observation

```text
ID | 項目 | 状態 | 担当者 | 備考 | 期限
```

結果は次のとおりです。

| 方式 | confidence | status |
|---|---:|---|
| flat | 0.699204 | novel |
| family-normalized | 0.752308 | matched |
| column-family-capped | 0.781781 | matched |

このケースから分かることは、「列familyを弱めれば厳しくなる」とは限らないことです。

列差異のweightを下げると、逆に一致しているskeletonやfillが相対的に強くなり、全体confidenceが上がります。

## 5. 2列表では逆方向に動く

1ラベル変更は次のとおりです。

```text
項目 | 値
  ↓
項目 | 内容
```

結果は次のとおりです。

| 方式 | confidence |
|---|---:|
| flat | 0.785965 |
| family-normalized | 0.746667 |
| column-family-capped | 0.785965 |

family-normalizedは2列表ではconfidenceを下げます。

一方、6列表の1ラベル変更ではは次のとおりです。

| 方式 | confidence |
|---|---:|
| flat | 0.829630 |
| family-normalized | 0.853333 |
| column-family-capped | 0.870175 |

同じ方式でも表幅により動く方向が変わります。

このため、「幅依存を除去する」という単一KPIだけでscore式を選ばないでください。

## 6. balance warningの読み方

### `confidence-near-gate`

top candidate confidenceがacceptance gateの近くにあります。

これは「matchedへ変えるべき」という意味ではありません。

むしろ、

- feature追加で境界が動かないか
- hash bucket差で結果が不安定にならないか
- fixtureを追加すべきか

を確認する合図です。

### `winner-margin-near-gate`

上位2候補の差がambiguity gate近傍です。

候補追加やfeature追加でwinnerが入れ替わりやすい領域です。

### `column-family-share-high`

`semantic-label + relative-position` がfeature全体の50%を超えています。

wide tableでは起こり得ます。

これは異常ではなく、「列比例featureの件数がscoreを支配しやすい」というレビュー用シグナルです。

### `single-family-share-high`

1 familyが60%を超えています。

新feature追加によってfamily構成が急に偏った場合の検知用です。

## 7. warning thresholdはproduction仕様ではない

現在の初期値は次のとおりです。

```text
near confidence distance = 0.03
near winner margin       = 0.02
max column-family share  = 0.50
max single-family share  = 0.60
```

これらはoffline review用です。

実務fixtureが増える前にproduction contractへ昇格させないでください。

## 8. 新しいscoring案を追加するとき

次の順番を守ります。

1. production matcherを変更しない
2. offline comparatorへ新strategyを追加する
3. exact matchを確認する
4. known driftを確認する
5. clearly novelを確認する
6. near-gate novelを確認する
7. ambiguousを確認する
8. 2 / 3 / 6 / wide tableで幅依存を見る
9. merge / occupancy / fill差を含むfixtureを見る
10. 改善と退行を同じ表に記録する

「平均confidenceが高い」は採用理由になりません。

重要なのは、

- false matchを増やしていないか
- false novelを減らせるか
- ambiguousを勝手にwinner化しないか
- 既存のfail-closed境界を維持できるか

です。

## 9. コードを読む順番

scoring変更を検討する場合は次の順で読むと理解しやすいです。

1. `flyInspiredFormatMatcher.ts`
   - production baseline

2. `worksheetFormatFeatureFamilyAnalysis.ts`
   - featureをfamilyとして観察する仕組み

3. `worksheetFormatScoringStrategyComparison.ts`
   - offline候補式

4. `worksheetFormatFeatureFamilyEvaluation.test.ts`
   - cardinality effectの基礎fixture

5. `worksheetFormatScoringStrategyComparison.test.ts`
   - scorer間の境界比較

6. issue-0126
   - なぜfamily balanceを調べ始めたか

7. issue-0127
   - 候補式を比較して何が分かったか

## 10. 現在の設計判断

現段階ではは次のとおりです。

```text
production scoring:
  flatを維持

family-normalized:
  不採用

column-family-capped:
  不採用

balance gate:
  offline評価継続
```

理由は、代替2方式が既存のnear-gate `novel` を `matched` へ反転させたためです。

これはfamily-based scoring一般を否定するものではありません。

今のfixture母集団では、安全性を上げる十分な証拠がない、という判断です。

## 11. 次に必要な証拠

次はscoring式を増やすより、balance warningのfixture評価を増やします。

優先するfixture:

- 6〜10列のwide table
- 1〜3列名変更
- fillあり / なし
- recurring mergeあり / なし
- occupancy partial / full
- titleあり / なし
- near-tied prototype複数
- metadata preambleあり
- style evidenceが薄いworksheet

warningが本当に「レビューすべき境界」を拾っているかを測ります。

十分な証拠が揃うまでは、warningを自動reject条件にも自動accept条件にも使いません。
