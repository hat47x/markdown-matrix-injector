# Fly-inspired worksheet format recognition

このディレクトリの書式認識コードは、Excel設計書の「どの書式に近いか」を補助的に判定するための**実験層**です。

Markdown Matrix Injector本体の決定論的な読み込み・変換・Markdown生成経路とは分離されています。ここでの判定結果が、そのままsource-of-truthやMarkdownを変更することはありません。

このREADMEは、ハエ脳・FlyHash・SheetJS内部実装に詳しくない参画者でも、通常のTypeScriptとExcel処理の知識から追えることを目的にしています。

## まず押さえるべきこと

この仕組みが行うのは、次の問いへの補助回答です。

> 今回読み込んだ表は、既知のどの書式に近いか。あるいは、既知書式へ安全に分類できないか。

最終結果は3種類です。

- `matched`: 既知書式の1候補へ十分近く、他候補との差も十分ある
- `ambiguous`: 既知書式として扱えるが、複数候補が近すぎて安全に1つへ決められない
- `novel`: 既知書式のどれかだと言えるだけの証拠が足りない

`novel`や`ambiguous`は失敗ではありません。誤って自動分類するよりも「分からない」と止まるための安全機構です。

## 全体のデータフロー

```text
XLSX
  |
  v
SheetJS read-only reader
  |
  v
WorksheetFormatSnapshot
  |
  v
worksheetFormatFeatureAdapter
  |
  v
abstract format features
  |
  v
source profile filter
  |
  +---------------------+
  |                     |
  v                     v
known prototype      observation
  |                     |
  +----------+----------+
             |
             v
flyInspiredFormatMatcher
             |
             v
matched / ambiguous / novel
```

各層の責務を混ぜないことが、最も重要な設計ルールです。

## ファイルごとの役割

### `flyInspiredFormatMatcher.ts`

既に抽象化されたfeature文字列だけを扱います。

Excel、セル、SheetJS、styleを知りません。

入力例:

```text
column:項目
column-position:0:項目
column:値
column-position:1:値
layout:2-columns
layout:header-contiguous
region:table
```

主な処理:

1. feature文字列を正規化する
2. 各featureを安定hashで固定次元へ投影する
3. activationの強いbucketだけを残し、疎なsignatureを作る
4. prototypeとのfeature類似度・sparse signature類似度を計算する
5. confidenceとDeviationScoreを求める
6. 閾値に応じて`matched` / `ambiguous` / `novel`へ分類する

### 「Fly-inspired」とは何か

ハエの嗅覚系やFlyHash研究から、**高次元入力を疎な表現へ写像し、強い反応だけを残して近い候補を探す**という計算上の着想を借りています。

生物学的な神経回路を再現しているわけではありません。SNN、connectome simulation、学習済みモデルも使いません。

実装としては、通常の決定論的なhash、集合類似度、ランキングです。

この区別を保つことで、生物学に詳しくなくてもコードをレビューできます。

### `worksheetFormatFeatureAdapter.ts`

`WorksheetFormatSnapshot`から、matcherへ渡せる抽象featureを作ります。

現在扱う主な情報:

- headerの列ラベル
- 表内部での相対列位置
- headerが連続しているか、途中に空き列があるか
- title mergeがheaderへ何列重なっているか
- headerの代表fill tone
- border evidence（ただしsource profileによっては比較から除外）

### なぜ絶対列番号をfeatureにしないのか

同じ表がA列開始でもE列開始でも、通常は同じ書式だからです。

そのため`column-position`はExcel全体の列番号ではなく、**表の左端から何列目か**を記録します。

### `worksheetFormatPrototype.ts`

prototype作成とsource profile境界を担当します。

prototypeは手書きfeature一覧ではありません。必ず通常のsnapshotを同じfeature adapterへ通して作ります。

これは重要です。prototype側だけfeatureを間引くと、観測側とのJaccard集合サイズが非対称になり、DeviationScoreが不自然になります。

## Source profileとは

入力経路ごとに、**どの種類のevidenceを比較に使ってよいか**を定義する契約です。

例:

```text
SheetJS CE XLSX 0.20.3
  structure: yes
  fill:      yes
  border:    no
```

「adapterがborderを受け取れる」ことと、「SheetJS CE XLSX parserがborderを安定して供給する」ことは別です。

このような外部ライブラリ由来の不確実性を、matcherへ漏らさないためにsource profileがあります。

## Feature contract version

`WORKSHEET_FORMAT_FEATURE_VERSION`は表示用versionではありません。

featureの種類や意味が変わると、旧prototypeと新観測を比較したDeviationScoreは意味を失う場合があります。そのためversionが一致しなければ比較を拒否します。

featureを追加・削除・意味変更した場合は、少なくとも次を確認してください。

1. adapterのfeature出力
2. `WORKSHEET_FORMAT_FEATURE_VERSION`
3. prototypeのversion gate
4. versionを固定確認している既存回帰テスト
5. 境界評価fixture

## 現在の既定matcher境界

```text
minConfidence = 0.7
minWinnerMargin = 0.05
```

判定順序は概念的に次の通りです。

```text
best candidate confidence < 0.7
    -> novel

best candidate is viable,
but top two confidence gap < 0.05
    -> ambiguous

otherwise
    -> matched
```

重要なのは、**同点だから必ずambiguousではない**ことです。

両候補ともconfidence 0.7未満なら、「候補同士は同程度だが、そもそも既知書式として扱う証拠が弱い」ため`novel`になります。

## 現在分かっている境界

### 3列以上の表

現行v3 featureでは、styleが使えない`structure only`でも、列名1件程度の変更なら既知候補として残せるケースがあります。

### 2列表

feature総数が少ないため、1列名の変更が全体類似度へ与える影響が大きくなります。

実測例:

```text
項目 / 値
   ↓
項目 / 内容
```

- `structure + fill`: matched（confidence 約0.705）
- `structure only`: novel（confidence 約0.672）

現段階では閾値を下げません。

情報が少ない場合に`novel`へ落ちることは、誤認識を防ぐための安全側の挙動と考えています。

## テストを読む順番

新しく参画する場合は、次の順で読むと追いやすくなります。

1. `worksheetFormatFeatureAdapter.test.ts`
   - snapshotから何がfeatureになるか
2. `worksheetFormatHierarchy.test.ts`
   - 粗い特徴と細かい特徴をなぜ重ねるか
3. `worksheetFormatStructuralFeatures.test.ts`
   - 相対位置・gap・title span
4. `worksheetFormatPrototype.test.ts`
   - source profileとversion gate
5. `worksheetFormatBoundaryEvaluation.test.ts`
   - 現実的な揺れに対して、どこまで吸収しどこで止まるか
6. `flyInspiredFormatMatcher.test.ts`
   - matcherそのものの一般的な判定規則

ファイル名が異なる場合は、`worksheetFormat` / `flyInspiredFormat`を含むテストを同じ目的で探してください。

## 変更時のチェックリスト

featureやmatcherを変更する前に、次を確認してください。

- この変更はExcel読取層、feature抽出層、matcher層のどこに属するか
- 別層の責務を持ち込んでいないか
- 同じ入力なら必ず同じ出力になるか
- prototypeとobservationで同じfeature生成経路を使っているか
- evidence不足をDeviationとして誤計上していないか
- `novel` / `ambiguous`を無理に`matched`へ変えていないか
- source-of-truthを変更していないか
- production経路へ接続する変更なら、別途ADR/Issueで明示されているか
- 新しい専門用語を、通常の実装用語でも説明しているか
- 境界条件を含むローカルテストを実行したか

## この層が行わないこと

現在の実験層は次を行いません。

- Excelを書き換える
- format definitionを書き換える
- Markdownを書き換える
- 書式候補を自動採用してproduction処理を進める
- LLMや外部APIへデータを送る
- 学習によって実行ごとに挙動を変える

この非責務が崩れる変更は、単なるリファクタリングではなくアーキテクチャ変更として扱ってください。

## 次に改善しやすい領域

2列表やstyle情報が薄い表に対して、閾値を緩める前に追加evidenceを検討できます。

候補:

- データ行の大まかな型パターン
- 空白セルの配置
- titleとheaderの距離
- header直下の繰り返し構造
- merge配置の粗い形

ただし、セル値の意味理解を深く行いすぎると、決定論的format parserと認知補助層の境界が曖昧になります。追加featureは「書式の形」を表すことを基本とします。
