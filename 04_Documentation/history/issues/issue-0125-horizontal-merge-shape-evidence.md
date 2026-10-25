# Issue: 横方向のセル結合形状を相対的な構造的証拠として扱う

この文書は当時のIssue記録です。2026年9月17日に記録された10件のローカルテストと境界ケースは当時の実績です。v6の横方向merge maskと厳格過半数を維持し、縦方向・矩形mergeや製品経路の未対応を受入済みにしません。

## Meta
- Type: Feature / Evaluation
- Status: Done
- Priority: High
- Scope: `worksheetFormatFeatureAdapter.ts`, feature contract, merge-shape tests, experimental README
- Expected verification level: unit + boundary evaluation

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0124 Done
- Feature contract after this issue: `worksheet-format-v6`

## 背景

v4ではtitle/header/bodyの位置関係、v5では複数本文行のoccupancy傾向を追加し、セル値の意味を解釈せずにstructure-only認識を強化した。

次に残る観測可能な構造はmerge配置である。Excel設計書では、見出しのまとまりや本文内のグルーピングを表すため、横方向のセル結合が繰り返し使われることがある。

ただし、mergeの**個数**をそのままfeatureにすると、本文データ行が増えただけで別書式になり得る。また、Excel上の絶対列番号を記録すると、表を右へ移動しただけでidentityが変わる。

そこで本Issueでは、表の水平範囲にある「隣接列境界」が横方向mergeによって接続されているかを相対bit maskへ圧縮する。

## 目的

### 入力

既存の `WorksheetFormatSnapshot`。

- cell text
- row / column
- merge range
- optional style evidence

### 変換

表の水平範囲が4列なら、列間境界は3つある。

```text
A | B | C | D
  0   1   2
```

たとえばB:Cだけが横方向mergeなら、相対maskは次になる。

```text
010
```

Excel上で表全体がH:Kへ移動してもmaskは変わらない。

### 出力

headerに横方向mergeがある場合。

- `merge:header-horizontal-present`
- `layout:header-horizontal-merge-links:<bits>`

本文先頭側で同じ横方向mergeが繰り返される場合。

- `merge:body-horizontal-recurring`
- `layout:body-majority-horizontal-merge-links:<bits>`

## headerとbodyで扱いを分ける理由

headerは1行の構造そのものなので、その行に存在する横方向mergeをそのまま保持する。

本文はデータ件数や偶発的な装飾に引きずられやすいため、v5のoccupancyと同じ先頭最大4本文行だけを対象にし、各列境界について**厳格過半数**の行でmergeされる場合だけ `1` とする。

したがって3行中1行だけにあるmergeはformat identityへ入らない。3行中2行以上で同じ境界がmergeされて初めてrecurring shapeとみなす。

## 設計詳細

### 1. bitは物理的な隣接列境界を表す

headerの非空セル数ではなく、`headerStart` から `headerEnd` までの物理的な列spanを基準にする。

これはmergeが複数列をまたぐ場合、結合範囲内の非anchorセルが空である可能性があるためである。

4列spanならmask長は常に3になる。

### 2. 絶対列位置を保存しない

mask indexは表左端からの相対境界であり、worksheet全体の列番号ではない。

これにより、同じ書式をA列開始からH列開始へ移動してもfeature集合が変わらない。

### 3. coarse + fine の二層featureにする

mergeが存在することを示す粗いfeatureと、具体的なlink maskを示す細かいfeatureを併用する。

例は次のとおりです。

```text
merge:body-horizontal-recurring
layout:body-majority-horizontal-merge-links:100
```

shapeだけが変わった場合は粗いfeatureを共有しつつ、具体maskの差がDeviationとして残る。

### 4. mergeが無い場合の専用featureは作らない

`merge:none` のようなfeatureを全表へ追加すると、mergeを持たない多数の表が共通featureを1つ余計に持ち、類似度を機械的に押し上げる。

v6では、観測できる横方向mergeがある場合だけfeatureを追加する。

### 5. 縦方向・矩形mergeは今回扱わない

`startRow !== endRow` のmergeはv6のhorizontal shape evidenceから除外する。

縦方向mergeや複数行×複数列の矩形mergeまで同じfeatureへ混ぜると、bitの意味が曖昧になるためである。必要性が確認された場合は別Issueで扱う。

### 6. title mergeは既存featureを維持する

title mergeはすでに `layout:title-span:*` と `layout:title-header-gap:*` で観測している。

v6のheader/body merge featureはtitle rowを重複計上しない。

## 非責務

このIssueでは次を行わない。

- mergeされたセル内容の意味を推論する
- mergeを解除・作成する
- 縦方向mergeを分類する
- merge個数をデータ量依存のfeatureとして記録する
- matcher閾値を変更する
- production workbook / Markdown経路へ接続する
- source-of-truthを書き換える

## Feature contract

feature集合の意味が増えるため、`WORKSHEET_FORMAT_FEATURE_VERSION` を `worksheet-format-v6` に上げる。

v5 prototypeとv6 observationは既存version gateで比較前に拒否する。

## Acceptance criteria

- [x] headerの横方向mergeを相対link maskとして保持する。
- [x] 表を水平移動してもmerge maskが変わらない。
- [x] 本文は先頭最大4行の厳格過半数でrecurring mergeだけを保持する。
- [x] 単発の本文mergeはfeature化しない。
- [x] 本文1行だけの場合と、同じshapeが複数行続く場合で同じfeature集合を生成できる。
- [x] 矩形・縦方向mergeをhorizontal evidenceへ混入しない。
- [x] merge差だけでは既知書式を過剰に拒否せず、Deviationとして残す。
- [x] merge shape消失と列名変更が重なる場合はfail-closedできる。
- [x] matcherの `minConfidence=0.7` / `minWinnerMargin=0.05` を変更しない。
- [x] feature contractをv6へ上げ、既存version固定回帰を同じ変更単位で更新する。
- [x] production経路へ接続しない。

## Validation evidence

### 2026-09-17 local validation

実行環境は次のとおりです。

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

まずv6 adapter/prototypeと専用merge-shape suiteをコンパイルし、**10 tests / 10 pass / 0 fail** を確認した。

確認した境界は次のとおりです。

| ケース | 結果 |
|---|---|
| header B:C merge、4列span | `layout:header-horizontal-merge-links:010` |
| 同じheader mergeを右へ7列移動 | feature集合不変 |
| 本文3行中2行でA:B merge | recurring mask `100` |
| 本文3行中1行だけA:B merge | recurring merge featureなし |
| 本文1行と3行で同じmerge shape | feature集合一致 |
| 2行×2列の矩形merge | horizontal evidenceへ入らない |
| 同じ列名でrecurring mergeだけ消失 | `matched`、Deviationあり |
| 列名1件変更 + recurring merge消失 | `novel` |
| recurring merge位置だけ変更 | `matched`、Deviationあり |

この結果から、merge shapeは単独で分類を支配せず、他の構造差と組み合わさったときに安全境界を補強する補助evidenceとして機能する。

GitHub Actionsは既知のrunner/resource不足があるため完了条件にせず、ローカル検証を正とする。

## 参画者向けの読み方

この機能を理解するためにmerge APIの詳細知識は不要である。

1. `WorksheetFormatMerge` は「左上から右下までの結合範囲」と読む。
2. v6では同じ行の横方向mergeだけを見る。
3. 表内の列境界を左からbitへ置き換える。
4. bodyでは複数行の多数派だけを残す。
5. matcherは他featureと同じ文字列集合として比較する。

つまり、実装契約は「Excel mergeを相対的な境界接続パターンへ変換する決定論的処理」であり、生物学的知識は不要である。

## 次段階

意味推論なしで追加できるstructure evidenceはかなり揃ってきた。次は次の順で検討する。

1. title/header/body以外の明確な区切り構造が実fixtureに十分存在するか評価する
2. v3〜v6のfeatureが増えたことによるfamily間の実質的な重み偏りをfixture群で測る
3. 必要性が確認できた場合のみ、値の粗い型パターンを独立Issueで検討する
4. 十分なfixtureが揃った後にproduction接続可否を別ADR/Issueで判断する
