# Feature family analysis guide

この文書は、`worksheetFormatFeatureFamilyAnalysis.ts` を使って、現在のworksheet書式matcherが**どの種類のfeatureにどの程度影響されているか**を確認するためのガイドです。

このanalysis helperはmatcher本体ではありません。Excelを読み込まず、prototypeを変更せず、weightや閾値も変更しません。既存matcherへ同じfeature集合を渡し直し、その結果を観察するだけです。

## まず理解すること

現在のmatcherは、次のようなfeatureを1つの集合として比較します。

```text
column:項目
column-position:0:項目
layout:first-body-gap:0
layout:body-majority-occupancy:11
merge:body-horizontal-recurring
header:dark-fill
```

featureごとに「labelは2倍」「mergeは0.5倍」といった明示的weightはありません。

そのため、あるfamilyのfeature数が増えると、そのfamilyは結果へ影響しやすくなります。特に列ラベルと相対位置は列数に比例して増えます。

このhelperの目的は、その状態を**見えるようにすること**です。

## familyとは何か

ここでいうfamilyは、生物学的な概念ではありません。実装を読みやすくするための分析上の分類です。

| family | 代表例 |
|---|---|
| `semantic-label` | `column:項目` |
| `relative-position` | `column-position:0:項目` |
| `table-skeleton` | `layout:first-body-gap:0` |
| `body-occupancy` | `layout:body-majority-occupancy:11` |
| `merge-shape` | `layout:body-majority-horizontal-merge-links:100` |
| `fill` | `header:dark-fill` |
| `border` | `border:grid` |
| `other` | まだ分類規則を追加していない将来feature |

`other` があるのは意図的です。新しいfeatureを追加したとき、既存familyへ自動的に入れてしまうより、「分類が未定義」と見えるほうが安全だからです。

## 1. family構成比を見る

`summarizeWorksheetFormatFeatureFamilies(features)` は、feature vector内で各familyが何件あるかと、その比率を返します。

たとえば2列表と6列表を比べると、`column:*` と `column-position:*` は列数に比例して増えますが、table skeletonの多くは増えません。

この情報から、表幅によってどのfamilyの比率が変わるかを確認できます。

## 2. ablationを見る

`evaluateWorksheetFormatFeatureFamilyAblation(...)` は、1つのfamilyをobservationとprototypeの双方から除外して、既存matcherを再実行します。

```text
confidenceDelta = baselineConfidence - ablatedConfidence
```

読み方は次のとおりです。

- `confidenceDelta > 0`: そのfamilyの一致が候補を支えている
- `confidenceDelta < 0`: そのfamilyの差異が候補を下げている
- 0に近い: そのペアでは影響が小さい

### 例

prototype:

```text
項目 | 値
```

observation:

```text
項目 | 内容
```

この場合、semantic label familyを除くと差異が1つ消えるため、ablated confidenceは上がります。したがって`confidenceDelta`は負になります。

一方、両者で一致しているtable skeletonを除くと支持材料が消えるため、confidenceは下がり、`confidenceDelta`は正になります。

## ablationをweightとして使わない

ablation値をそのまま新しいweightへ変換してはいけません。

理由は3つあります。

1. feature family同士は独立ではない。
2. sparse signature側にはhash bucket衝突がある。
3. 広い表で未変更列が多いことは、実際に「同じ書式らしい」証拠でもあり得る。

したがって、このhelperは**診断用**です。scoring変更は、複数方式を同じfixture群で比較してから別Issue/ADRで判断します。

## 変更時の確認

新しいfeatureを追加した場合は次を確認してください。

1. `classifyWorksheetFormatFeature`で意図したfamilyへ入るか。
2. 未分類なら`other`として意図的に残すのか、新familyを作るのか。
3. 2列・3列・6列など表幅が異なるfixtureでfamily shareがどう動くか。
4. 既存のknown / ambiguous / novel境界がfeature件数だけで押し上げられていないか。
5. matcher重みを変えずに説明できる変化か。

## 非責務

このhelperは以下を行いません。

- worksheetからfeatureを抽出する
- source profileを選ぶ
- production処理へ候補を採用する
- matcherのweightを変更する
- `minConfidence` / `minWinnerMargin`を変更する
- Excel / format definition / Markdownを書き換える

この境界を越える変更は、analysis helperの修正ではなく、scoringまたはarchitecture変更として扱います。
