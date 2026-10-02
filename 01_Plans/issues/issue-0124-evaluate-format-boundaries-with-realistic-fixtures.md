# Issue: 実務に近い書式fixtureで認知境界を評価する

## Meta
- Type: Test / Evaluation
- Status: Done
- Priority: High
- Scope: `03_Implement/test/worksheetFormatBoundaryEvaluation.test.ts`, `03_Implement/src/experimental/README.md`
- Expected verification level: unit / architectural review

## 目的

ハエ脳由来書式認識系は、ここまでに次の部品へ分離された。

1. worksheetを読み取り専用snapshotへ変換する
2. snapshotから書式featureを抽出する
3. 入力経路ごとのsource profileで、比較に使ってよいevidenceだけを残す
4. 既知prototypeとの類似度を計算する
5. `matched` / `ambiguous` / `novel` のいずれかとして返す

ここで重要なのは、**matcherの閾値を先に調整することではなく、現在のfeature表現だけでどの程度まで安全に識別できるかを把握すること**である。

本Issueでは、実務のExcel設計書を模した複数の表をfixtureとして組み立て、`structure + fill`と`structure only`の2つの観測条件で境界を固定した。

## この評価が必要な理由

単一の正常系だけをテストすると、似た表を過剰に同一視する問題や、style情報が欠けたときに急に判定不能になる問題を見逃しやすい。

実際のExcel設計書では、次のような揺れが起こり得る。

- 表全体が右へ数列ずれる
- headerの塗り色だけ変わる
- 列名が1件だけ言い換えられる
- 列の順序が入れ替わる
- 途中に空き列が挿入される
- 似た2列テーブルが複数存在する
- style metadataが取得できず、構造情報しか使えない

このため、単なる正解率ではなく、**どの揺れを吸収し、どの揺れで止まるべきか**をテストとして残す。

## 評価fixture

基準prototypeとして次の4種類を用意する。

| ID | 想定用途 | 列 |
|---|---|---|
| `release` | リリース判定表 | ID / 項目 / 判定 / 確認者 / 備考 / 期限 |
| `interface` | インターフェース定義 | 項目名 / 型 / 必須 / 桁数 / 説明 / 例 |
| `code` | コード一覧 | コード / 名称 / 説明 |
| `settings` | 設定表 | 項目 / 値 |

これらは手書きfeatureではなく、通常の`WorksheetFormatSnapshot`から同じadapterを通してprototype化する。

## 観測条件

### A. `structure + fill`

現在のSheetJS CE XLSX 0.20.3向け保守的source profile。

比較に使う情報は次のとおりです。

- セル文字列
- header内の相対位置
- header連続性
- title merge span
- fill有無と代表tone

borderは保証対象外なので使わない。

### B. `structure only`

style metadataが信頼できない、または取得できない状況を模擬するprofile。

比較に使う情報は次のとおりです。

- セル文字列
- header内の相対位置
- header連続性
- title merge span

fillとborderは使わない。

## 期待境界

### 表全体の水平移動

`release`表をA列開始からE列開始へ移動しても`matched`とする。

理由: 書式の意味はExcel上の絶対列番号ではなく、表内部の相対位置にあるため。

### 明確に異なる依存関係表

`サービス / 接続先 / 方式 / 備考`の4列表は`novel`とする。

理由: 列名・列数・相対配置の組合せが既知prototypeと十分に異なるため。無理に既知書式へ寄せない。

### header途中への空き列挿入

基準では連続している`release` headerへ空き列を挿入した場合は`novel`とする。

理由: 現段階では、空き列は単なる表示上の揺れではなくレイアウト構造変更として扱う。将来これを許容する場合は、具体的な実Workbook例を根拠に別Issueで変更する。

### 3列表の列名1件変更

`コード / 名称 / 説明` → `コード / 表示名 / 説明`は、両profileで`matched`とする。

理由: 残りの構造evidenceが十分あり、既定confidence 0.7を維持したまま候補を保持できるため。

### 2列表の列名1件変更

`項目 / 値` → `項目 / 内容`は条件によって扱いが変わる。

- `structure + fill`: `matched`
- `structure only`: `novel`

これは重要な境界である。2列表はfeature総数が少ないため、style evidenceを失った状態で列名1件を変更するとconfidenceが既定0.7を下回る。

この結果を見て閾値を下げない。**情報が不足しているときに止まるのは安全側の挙動**である。

### 2候補が等距離の場合

`項目 / 値`と`項目 / 説明`をprototypeとし、`項目 / 内容`を観測する。

- `structure + fill`: 両候補が既定confidenceを超えたうえで等距離なので`ambiguous`
- `structure only`: 両候補は等距離だが、どちらも既定confidence未満なので`novel`

この順序は意図的である。

1. まず「既知書式として扱えるだけの証拠があるか」を確認する
2. そのうえで「複数候補のどちらかを選べるか」を確認する

証拠自体が弱い場合は、候補同士が同点でも`ambiguous`ではなく`novel`とする。

## 参画者向け: `novel`と`ambiguous`の違い

### `novel`

「既知書式のどれかである」と判断するための証拠が不足している状態。

例は次のとおりです。

- 全く異なる表
- styleなし2列表で主要列名が変わった場合
- 大きなレイアウト変化

### `ambiguous`

「既知書式の候補ではある」ことは十分に確かだが、上位候補同士を安全に区別できない状態。

この区別により、UIや後段処理は次のような異なる支援を行える。

- `novel`: 新しい書式定義の作成候補として扱う
- `ambiguous`: 既存候補のどちらかを人に選んでもらう

ただし現段階ではproduction UIへ接続しない。

## 閾値について

本Issueではmatcher既定値を変更しない。

- `minConfidence = 0.7`
- `minWinnerMargin = 0.05`

評価fixtureを閾値へ合わせるのではなく、既定値のままでどこに境界が現れるかを観測する。

## Validation evidence

### 2026-09-12 local validation

実行環境は次のとおりです。

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- strict / ES2022 / NodeNext

現在のv3実装を用い、構造featureテスト5件と新しい境界評価12件を同時実行した。

- **17 tests / 17 pass / 0 fail**

主な実測値は次のとおりです。

| ケース | profile | status | confidence概況 |
|---|---|---|---|
| 水平移動 | structure + fill | matched | 1.0 |
| 水平移動 | structure only | matched | 1.0 |
| fill dark → gray | structure + fill | matched | 約0.898 |
| fill dark → gray | structure only | matched | 1.0（fillを比較しないため） |
| 6列中1列名変更 | structure + fill | matched | 約0.806 |
| 6列中1列名変更 | structure only | matched | 約0.793 |
| 3列中1列名変更 | structure + fill | matched | 約0.758 |
| 3列中1列名変更 | structure only | matched | 約0.705 |
| 2列中1列名変更 | structure + fill | matched | 約0.705 |
| 2列中1列名変更 | structure only | novel | 約0.672 |
| header途中に空き列 | structure + fill | novel | 約0.473 |
| header途中に空き列 | structure only | novel | 約0.444 |

GitHub Actionsは既知のリソース不足のため完了条件から除外する。

## 結論

現行v3 featureは、3列以上の典型的な表ではstyle evidenceがなくても軽微な列名変更を吸収できる。一方、2列表ではstyleなし時の情報量が不足しやすく、安全側に`novel`へ落ちる。

したがって次段階では閾値緩和を行わず、2列表に対して追加できる**構造的かつ安定したevidence**を検討する。候補は、データ行の型・値パターン、近傍ラベル、タイトルとheaderの関係などである。ただし、実データ値を意味分類へ過剰利用して決定論的format parserとの境界を崩さないよう注意する。

## 非目標

- matcher閾値の最適化
- 機械学習モデルの導入
- production workbook pathへの接続
- 書式の自動修正
- source-of-truthの変更
