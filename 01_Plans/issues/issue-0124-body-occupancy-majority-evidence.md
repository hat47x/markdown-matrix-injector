# Issue: 複数本文行の occupancy pattern を安定した構造 evidence として扱う

## Meta
- Type: Feature / Evaluation
- Status: In Progress
- Priority: High
- Scope: `worksheetFormatFeatureAdapter.ts`, feature contract, boundary tests, experimental README
- Expected verification level: unit + boundary evaluation

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0123 Done
- Planned feature contract: `worksheet-format-v5`

## 背景

v4では、タイトル・ヘッダー・最初の本文行の位置関係をtable skeletonとして加えることで、2列表のstructure-only認識を閾値変更なしで回復できた。

次に確認したいのは、最初の本文行だけでなく、複数の本文行に繰り返される「どの列が埋まりやすいか」という配置パターンである。これはセル値の意味を読まずに観測でき、Excel設計書の書式らしさを表すstructure evidenceとして利用できる。

ただし、単純に「本文が2行以上ある」というfeatureを追加すると、同じ書式でもデータが1行しかないworksheetが不当にprototypeから離れる。データ量そのものをformat identityにしてはならない。

そこで、このIssueでは本文行数をfeature化せず、観測できた本文行から列ごとの多数派occupancyを1つの相対maskへ圧縮する。

## 目的

### 入力

既存の `WorksheetFormatSnapshot` と、v4で確定したheader列集合。

### 変換

headerより下で、header列のいずれかに非空セルを持つ本文候補行を上から最大4行まで観測する。

各header列について、観測行の**過半数**で非空なら `1`、それ以外なら `0` とする。

例:

```text
header: A B C
row 1 : x x x
row 2 : x x -
row 3 : x x x

=> 111
```

C列は3行中2行で埋まっているため、多数派maskでは `1` になる。

### 出力

- `layout:body-majority-occupancy:<bits>`

例:

- 2列とも多数派で埋まる: `layout:body-majority-occupancy:11`
- 2列目だけ多数派で空く: `layout:body-majority-occupancy:10`

### 非責務

- 本文行数そのものをformat featureにしない
- セル値の型・意味を推論しない
- 空欄の業務上の意味を判断しない
- matcher閾値を変更しない
- production経路へ接続しない

## 設計上の重要点

### 1. なぜ「繰り返し回数」をfeatureにしないか

prototypeが3行、observationが1行というだけで書式を別物にすると、データ量をformat identityへ混入させてしまう。

そのため、1行しか観測できない場合も、その1行から同じmaskを計算する。複数行がある場合は多数派を取ることで、単発の空欄に過敏にならないようにする。

### 2. なぜ最大4行か

目的は全データ解析ではなく書式の初期形状を補助観測することである。無制限に走査すると大きなworksheetで不要なコストが増え、footerや別領域を巻き込む可能性も高まる。

初期値は4行とし、性能・識別力の両面で不足が確認された場合のみ別Issueで変更する。

### 3. なぜ過半数か

「1行でも埋まっていればoccupied」とすると偶発値に引っ張られ、「全行で埋まっていなければ空」とすると任意項目の単発空欄に過敏になる。

過半数は、繰り返される配置傾向を粗く残すための保守的な中間点として採用する。

偶数行では同数をoccupiedにしない。2行中1行だけ埋まる列は `0` とし、曖昧な場合に証拠を強く見積もらない。

## Acceptance criteria

- [ ] 最大4本文行から相対occupancy majority maskを決定論的に生成する。
- [ ] 水平移動してもmaskが変わらない。
- [ ] 1本文行しかない同一書式でも、多行prototypeと同じmaskを生成できる。
- [ ] 3行中1行だけの空欄は、多数派maskを変えない。
- [ ] 3行中2行以上で同じ列が空く場合はmask差として残る。
- [ ] 両列名が異なる別表は新feature追加後も`novel`を維持する。
- [ ] matcher既定閾値を変更しない。
- [ ] feature contractをv5へ上げ、関連version固定テストを同じ変更単位で更新する。
- [ ] production経路へ接続しない。
- [ ] READMEに初心者向けの背景・読み方・非責務を反映する。

## 検証方針

GitHub Actionsは既知のリソース不足があるため完了条件に使わず、Node.js / TypeScriptのローカルstrict compileと関連unit/boundary testで代替する。
