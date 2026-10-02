# Snapshot-level drift evaluation guide

この文書は、feature文字列を直接組み立てる評価から一段進み、`WorksheetFormatSnapshot` を既存adapterへ通した状態でmulti-family drift signalを確認するための手引きです。

## 1. 評価経路

今回は次の既存経路を再利用します。

```text
WorksheetFormatSnapshot
  -> worksheetFormatFeatureAdapter
  -> source profile filter
  -> WorksheetFormatPrototype / observation
  -> flyInspiredFormatMatcher
  -> evaluation-only drift signals
```

評価側でfeature抽出やprofile filteringを再実装しません。

## 2. なぜsnapshot-levelが必要か

feature-level fixtureでは、欲しいfeatureを直接書けます。

しかし実際にはは次のとおりです。

- header candidate選択
- title mergeの検出
- title/header gap
- first body row
- first-body coverage
- majority occupancy
- recurring merge
- fill evidence
- source-profile filtering

を通してfeatureが生成されます。

snapshot-level評価は、この変換経路を含めてもsignalの傾向が残るかを確認します。

## 3. 今回の20 cases

9列のstructure+fillと、7列のstructure-onlyを使います。

含める差異は次のとおりです。

- exact
- one-label rename
- title/header gap
- first-body gap
- partial first-body coverage
- majority occupancy
- recurring horizontal merge
- fill unavailable
- clearly novel labels
- near-tied multiple prototypes
- structure-only側ではtwo-label driftも追加

## 4. Source profileの確認

structure-only fixtureでもraw snapshotにはdark fillを入れています。

評価ではは次のとおりです。

```text
rawObservationFeatures:
  header:dark-fill を含む

comparedObservationFeatures:
  header:dark-fill を含まない
```

ことを確認します。

つまり「fixtureにstyleが無い」のではなく、source profileが比較evidenceから除外しています。

## 5. Profile差とDeviationScore

同じ「1 label + first body gap」でも:

```text
9-column structure+fill
DeviationScore = 0.176471

7-column structure-only
DeviationScore = 0.214286
```

となります。

DeviationScoreはfeature集合全体のJaccardから作られるため、fillのような一致evidenceが追加されると同じ構造差が相対的に薄まります。

したがって固定DeviationScore thresholdをprofile横断で使う場合は慎重さが必要です。

## 6. Raw different-family count

1 label renameは現在:

- semantic-label
- relative-position

の2 familyへ現れます。

さらに構造差が1つ加わるとは次のとおりです。

- table-skeleton
- body-occupancy
- merge-shape

のいずれかが追加され、countは3になります。

今回、structure+fill / structure-onlyの双方で:

- title/header gap
- first-body gap
- partial coverage
- occupancy drift
- recurring merge drift

がすべてdifferent-family count 3として再現しました。

このsignalは差異量ではなく、**差異種類の広がり**を見ています。

## 7. Ablation countとの違い

ablationは「そのfamilyを両側から消したらcurrent scorerのconfidenceがどう動くか」を測ります。

したがってglobal sparse signatureも変わります。

snapshot-levelでもone-label renameだけでpenalizing-family countが4になるcaseがありました。

raw different-family countは2です。

このためは次のとおりです。

- raw family difference: feature表現上の差異種類
- ablation delta: current scorerへの寄与診断

として役割を分けます。

## 8. 今回のmetrics

```text
boundary warning
precision 1.000000
recall    0.307692

matched DeviationScore >= 0.18
precision 1.000000
recall    0.461538

matched different-family count >= 3
precision 1.000000
recall    0.769231

matched penalizing-family count >= 3
precision 0.875000
recall    0.538462

boundary OR different-family count
precision 1.000000
recall    1.000000
FPR       0.000000
```

最後の結果をproduction ruleにはしません。

20 synthetic snapshotsだけでは、実XLSX readerの出力分布を代表しないためです。

## 9. Multiple prototype

near-tied caseはprototypeを2つ作り、observationをその中間に置きます。

この場合はdifferent-family countよりwinner-margin boundaryが主signalになります。

multi-family signalはambiguous判定の代替ではありません。

## 10. 次に確認すること

次段階はreal XLSX fixtureです。

特に確認したいのはは次のとおりです。

- merged subordinate cellsがsnapshotでどう見えるか
- blank cellがreaderで保持されるか
- fill evidenceが実runtimeでどこまで安定するか
- metadata preamble
- titleなし
- gapped header
- multiple prototype

です。

実readerのsnapshotが今回のsynthetic snapshotと大きく異なる場合、signal thresholdではなくfeature contract側を再検討します。
