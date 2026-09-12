# Issue: ハエ脳由来書式認識系の参画難易度を文書品質で一段下げる

## Meta
- Type: Documentation / Architecture Enablement
- Status: Done
- Priority: High
- Scope: ハエ脳由来書式認識に関するADR・Issue・実装コメント・検証記録
- Expected verification level: review

## 背景

ハエ脳由来の疎表現、winner-take-all、novelty判定、Jaccard類似度、SheetJSのstyle evidenceなどは、それぞれ単体では難解ではないが、複数の概念が同時に現れると参画者に要求される前提知識が急に高くなる。

この領域で必要なのは、実装そのものを単純化して精度を落とすことではなく、**設計意図・データの流れ・保証境界・未解決点を丁寧に外在化し、理解に必要な暗黙知を減らすこと**である。

目標は、従来なら「内部設計を自力で再構成できる上級者」が必要だった箇所を、「通常のTypeScript実装とExcelデータ処理を理解でき、文書を読みながら追える中級者」が安全に参画できる状態にすることとする。

## 方針

### 1. 各変更は「目的→入力→変換→出力→非責務」の順で説明する

実装説明では少なくとも次を記載する。

1. 何を解決するための機能か
2. 何を入力として受け取るか
3. どのような変換を行うか
4. 何を出力するか
5. 何をこの層では行わないか

特に「認知系」という語だけで処理を曖昧化せず、通常のソフトウェア処理として説明可能な粒度まで分解する。

### 2. 生物学的比喩と実装契約を分離する

「ハエ脳由来」「FlyHash風」「WTA」は着想元として説明するが、実装契約は必ず通常の計算機科学用語でも記述する。

例:

- FlyHash風疎表現
  - 着想: 多次元入力を疎な活動パターンへ写像する
  - 実装契約: 正規化済みfeature文字列を安定hashで固定次元へ投影し、上位activationだけを残す
- winner-take-all
  - 着想: 強い候補だけを残す
  - 実装契約: confidence順で候補を並べ、閾値未満は`novel`、上位差が小さければ`ambiguous`とする

これにより、生物学の知識がなくてもコードレビュー可能にする。

### 3. 保証される情報と観測できた情報を区別する

SheetJSなど外部ライブラリ由来の情報では、

- 実装上その値を受け取れる
- 実際の入力経路で安定して供給される

を混同しない。

そのためsource profileを用いて、比較に使ってよいevidenceを明示する。

例:

- `structure`: セル文字列・位置・mergeなど
- `fill`: 現在のSheetJS CE XLSX経路で保証対象
- `border`: adapterでは受け取れるが、現在のSheetJS CE XLSX source profileでは保証対象外

### 4. fail-closed理由を明記する

この系はMarkdown生成前の補助認知層であり、誤認識による自動変換を避ける必要がある。

そのため、

- 未知書式 → `novel`
- 候補拮抗 → `ambiguous`
- feature version不一致 → 比較拒否
- source profile不一致 → 比較拒否

とする。

「なぜ止めるのか」をコードだけから推測させず、Issue/ADRに理由を残す。

### 5. 検証記録は結果だけでなく境界条件を残す

`N tests / N pass`だけではなく、少なくとも以下を残す。

- 何を正常系としたか
- どの差異を同一書式として許容したか
- 何を別書式として拒否したか
- ambiguousをどのように作ったか
- 閾値を変更したか否か

これにより、新規参画者が「テストが通る理由」を再構成しなくて済むようにする。

### 6. 原則として1 Issue = 1理解単位にする

巨大な一括変更を避け、次のように理解単位を分ける。

- worksheet → snapshot
- snapshot → abstract features
- prototype生成
- source profile境界
- matcher
- evaluation fixture
- production接続

各Issueは前段の成果を前提にできるが、次段の内部まで理解しなくてもレビュー可能な構造を目指す。

## 参画者向けの現在の全体像

```text
Excel / XLSX
   |
   v
SheetJS read-only reader
   |
   v
WorksheetFormatSnapshot
  - cell text
  - relative position
  - merge
  - optional style evidence
   |
   v
Worksheet format feature adapter
  - column labels
  - relative column positions
  - header continuity
  - title merge span
  - fill evidence
   |
   v
Source profile filter
  - この入力経路で保証されるevidenceだけ残す
   |
   +--------------------+
   |                    |
   v                    v
Prototype            Observation
   |                    |
   +---------+----------+
             |
             v
Fly-inspired sparse matcher
  - deterministic sparse projection
  - candidate ranking
  - novelty / ambiguity gate
             |
             v
matched / ambiguous / novel

※ ここまでは候補判定だけ。
※ Excel、format definition、Markdownを自動変更しない。
```

## 用語の最小説明

### Prototype
既知の書式を、観測時と同じadapterから得たfeature集合で表した基準データ。

### Observation
今回読み込んだworksheetから得たfeature集合。

### Feature
`column:項目`、`layout:header-contiguous`のような、書式の特徴を表す文字列。

### Source profile
入力経路ごとに「どの種類のfeatureを信頼して比較してよいか」を定義する契約。

### DeviationScore
prototypeとobservationの差の大きさ。大きいほど基準書式から離れている。

### Novel
既知書式へ十分近くない状態。無理に分類しない。

### Ambiguous
複数候補が近すぎて安全に勝者を決められない状態。

## Definition of Doneへの追加

今後この領域のIssueは、実装完了条件に加えて次を満たす。

- [x] 背景説明があり、変更理由をコード外でも追える。
- [x] 入力・出力・非責務が説明されている。
- [x] 新しい専門用語には通常の実装用語での説明がある。
- [x] fail-closed条件があれば理由を記録する。
- [x] 検証結果に境界条件を含める。
- [x] 未解決事項・次段階を明記する。

## 運用上の判断

文書量を増やすこと自体は目的ではない。既存ADRやIssueから自明な内容は参照し、重複説明は避ける。一方で、参画者が複数ファイルを読んでもなお推測しなければならない設計意図は、重複ではなく欠落とみなし補う。

今後のfixture評価、閾値設計、production接続でもこの基準を適用する。
