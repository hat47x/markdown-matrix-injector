# Issue: 小規模表の識別を補うtable skeletonの構造的証拠を追加する

この文書は当時のIssue記録です。2026年9月17日のローカル検証では34件のテスト成功と境界値を記録しています。worksheet-format-v4の構造特徴は候補判定のためのもので、production経路への接続や正本変更の受入を意味しません。

## Meta
- Type: Feature / Evaluation
- Status: Done
- Priority: High
- Scope: `03_Implement/src/experimental/worksheetFormatFeatureAdapter.ts`, `worksheetFormatPrototype.ts`, 関連テスト・README
- Expected verification level: unit + boundary evaluation

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0121 / issue-0122 Done
- Feature contract after this issue: `worksheet-format-v4`

## 背景

v3では、列名・相対列位置・headerの連続性・title merge spanを使うことで、style情報が薄いworksheetでも一定の書式識別が可能になった。

一方、境界評価では2列表に限って情報量不足が残った。基準が `項目 / 値`、観測が `項目 / 内容` の場合、`structure + fill` では既知候補として残るが、`structure only` ではconfidenceが約0.672となり、既定値 `minConfidence=0.7` を下回って `novel` になった。

ここで閾値を下げると、別書式まで既知候補へ入りやすくなる。したがって閾値調整より先に、**表の意味ではなく、表がどのような骨格で並んでいるか**を追加evidenceとして観測する。

このIssueでは、値の意味分類やデータ型推論には踏み込まない。タイトル、ヘッダー、最初の本文行という、通常のExcel設計書でも説明しやすい幾何学的な関係だけを扱う。

## 目的

### 入力

既存の `WorksheetFormatSnapshot`。

- cell text
- row / column
- merge
- optional style evidence

### 変換

header選択後、表の水平範囲を基準に次の構造を観測する。

1. title mergeとheaderの行間隔
2. headerより下に本文候補行が存在するか
3. headerから最初の本文候補行までの行間隔
4. 最初の本文候補行がheader列をすべて埋めているか

### 出力

追加するfeatureは次の4系統。

- `layout:title-header-gap:<n>`
- `body:present`
- `layout:first-body-gap:<n>`
- `layout:first-body-coverage:full|partial`

### 非責務

このIssueでは以下を行わない。

- セル値が数値・日付・コード等かを意味的に分類する
- 複数本文行から業務ルールを推論する
- matcher閾値を変更する
- production workbook / Markdown経路へ接続する
- source-of-truthを書き換える

## 設計詳細

### 1. title-header gap

既存のtitle判定は、header範囲と2列以上重なる横方向mergeのうち、文字を持つものをtitle候補としていた。

v4では同じ候補から行位置も保持し、`headerRow - titleRow - 1` を `layout:title-header-gap:<n>` として記録する。

複数候補がある場合は、次の順で決定論的に選ぶ。

1. headerとの重なり幅が大きい
2. 同じ幅ならheaderに近い

これにより入力順へ依存しない。

### 2. 最初の本文候補行

headerより下、かつheaderの水平範囲内にある非空セルを行単位にまとめ、最も上の行を最初の本文候補行とする。

ここで「本文」という語は業務意味を示さない。単にheaderより下に最初に現れる表内セル群という構造上の呼称である。

### 3. body gap

`firstBodyRow - headerRow - 1` を `layout:first-body-gap:<n>` とする。

通常の連続表では0となる。空行を挟む帳票では別の値になるため、書式差として保持できる。

### 4. first-body coverage

最初の本文候補行について、headerで実際に使われている各列に非空セルがあるかを見る。

- 全header列に値がある場合: `full`。
- 1列以上欠ける場合: `partial`。

header自体がgappedの場合でも、Excel上の連続spanではなく**headerが実際に使っている列集合**を基準にする。これにより、意図的な空き列を本文欠損と誤認しない。

### 5. なぜデータ型featureをまだ入れないか

`text / number / date / code` のような粗い型featureも候補ではあるが、文字列化されたExcel値では境界が曖昧になりやすい。例えば `01` は数値にもコードにも見える。

まずは意味解釈を伴わない骨格だけで不足を解消できるか評価し、それでも不足する場合に独立Issueとして型パターンを検討する。

## Feature contract

feature集合の意味が増えるため、`WORKSHEET_FORMAT_FEATURE_VERSION` を `worksheet-format-v4` に上げる。

v3 prototypeとv4 observationは比較しない。既存version gateで明示的に拒否する。

## Acceptance criteria

- [x] titleとheaderの行間隔をstructure featureとして保持する。
- [x] 最初の本文候補行の存在・行間隔・coverageをstructure featureとして保持する。
- [x] 水平移動してもfeature集合が変わらない。
- [x] 2列表の列名1件変更が `structure only` でも既定閾値のまま候補として回復する。
- [x] 両列名が異なる別表は `novel` を維持する。
- [x] 本文開始位置が変わった場合は差異として残る。
- [x] 最初の本文行が部分的な場合は差異として残る。
- [x] 本文evidenceが無い観測へ存在を捏造しない。
- [x] matcherの `minConfidence=0.7` / `minWinnerMargin=0.05` を変更しない。
- [x] production経路へ接続しない。
- [x] v4固定値を持つ既存回帰を同じ変更単位で更新する。

## Validation evidence

### 2026-09-17 local validation

実行環境は次のとおりです。

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

新しいv4 adapter / prototypeと、構造・階層・source profile・境界評価をまとめてコンパイルし、Node test runnerで **34 tests / 34 pass / 0 fail** を確認した。

主な境界値は次のとおりです。

| ケース | profile | status | confidence |
|---|---|---|---:|
| `項目 / 値` → `項目 / 内容`、本文骨格一致 | structure only | matched | 0.758333 |
| 両列名が異なる別表 | structure only | novel | 0.623810以下 |
| 本文開始を2行後ろへずらす | structure only | novel | 0.658204 |
| 最初の本文行をpartialにする | structure only | novel | 0.645249 |
| 本文evidenceを観測できない | structure only | novel | 0.540262 |

また、共有feature増加によりFlyHash風の疎hash側では、意味上対称な候補でもconfidenceが完全同値にならない場合が確認された。これはbugではなくhash bucket衝突の差である。

そのため既存のambiguous回帰は「上位2件のconfidenceが完全一致する」ではなく、実契約である「差が `minWinnerMargin` 未満で `ambiguous` になる」を確認する形へ改める。

## 判断

v4では、2列表の回復を閾値緩和ではなく追加evidenceで実現できた。しかも本文骨格が一致しない場合は引き続きfail-closedになる。

この結果から、次の段階でもまず観測可能な構造evidenceを増やし、それでも必要な場合にだけ粗いデータ型パターンへ進む方針が妥当である。

## 次段階

候補は次の順とする。

1. 複数本文行で繰り返されるoccupancy patternの評価
2. merge配置の粗いshape feature
3. 必要性が確認できた場合のみ、値の粗い型パターン
4. 十分なfixtureが揃った後にproduction接続可否を別ADR/Issueで検討
