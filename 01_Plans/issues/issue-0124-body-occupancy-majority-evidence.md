# Issue: 複数本文行の占有傾向を安定した構造的証拠として扱う

この文書は当時のIssue記録です。2026年9月17日に記録された20件のローカルテストと境界値は当時の実績です。最大4行・厳格過半数・閾値不変更を維持し、v5の候補判定を製品経路へ接続済みとは扱いません。

## Meta
- Type: Feature / Evaluation
- Status: Done
- Priority: High
- Scope: `worksheetFormatFeatureAdapter.ts`, feature contract, boundary tests, experimental README
- Expected verification level: unit + boundary evaluation

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0123 Done
- Feature contract after this issue: `worksheet-format-v5`

## 背景

v4では、タイトル・ヘッダー・最初の本文行の位置関係をtable skeletonとして加えることで、2列表のstructure-only認識を閾値変更なしで回復できた。

次に確認したのは、最初の本文行だけでなく、複数の本文行に繰り返される「どの列が埋まりやすいか」という配置パターンである。これはセル値の意味を読まずに観測でき、Excel設計書の書式らしさを表すstructure evidenceとして利用できる。

ただし、単純に「本文が2行以上ある」というfeatureを追加すると、同じ書式でもデータが1行しかないworksheetが不当にprototypeから離れる。データ量そのものをformat identityにしてはならない。

そこで、このIssueでは本文行数をfeature化せず、観測できた本文行から列ごとの多数派occupancyを1つの相対maskへ圧縮する。

## 目的

### 入力

既存の `WorksheetFormatSnapshot` と、v4までで確定したheader列集合。

### 変換

headerより下で、header列のいずれかに非空セルを持つ本文候補行を上から最大4行まで観測する。

各header列について、観測行の**過半数**で非空なら `1`、それ以外なら `0` とする。

例は次のとおりです。

```text
header: A B C
row 1 : x x x
row 2 : x x -
row 3 : x x x

=> 111
```

C列は3行中2行で埋まっているため、多数派maskでは `1` になる。

### 出力

追加するfeatureは1系統だけとする。

```text
layout:body-majority-occupancy:<bits>
```

例は次のとおりです。

- 2列とも多数派で埋まる: `layout:body-majority-occupancy:11`
- 2列目だけ多数派で空く: `layout:body-majority-occupancy:10`

### 非責務

このIssueでは以下を行わない。

- 本文行数そのものをformat featureにする
- セル値の型・意味を推論する
- 空欄の業務上の意味を判断する
- matcher閾値を変更する
- production workbook / Markdown経路へ接続する
- source-of-truthを書き換える

## 設計詳細

### 1. なぜ「繰り返し回数」をfeatureにしないか

prototypeが3行、observationが1行というだけで書式を別物にすると、データ量をformat identityへ混入させてしまう。

そのため、1行しか観測できない場合も、その1行から同じmaskを計算する。複数行がある場合は多数派を取ることで、単発の空欄に過敏にならないようにする。

ローカル検証では、同じ2列表について本文1行と本文3行から**完全に同じstructure feature集合**が得られることを確認した。

### 2. なぜ最大4行か

目的は全データ解析ではなく書式の初期形状を補助観測することである。無制限に走査すると大きなworksheetで不要なコストが増え、footerや別領域を巻き込む可能性も高まる。

初期値は4行とした。5行目以降のoccupancyが変わってもfeatureが変化しないことを回帰テストで固定している。

必要性が確認された場合のみ、上限値は別Issueで再評価する。

### 3. なぜ過半数か

「1行でも埋まっていればoccupied」とすると偶発値に引っ張られ、「全行で埋まっていなければ空」とすると任意項目の単発空欄に過敏になる。

過半数は、繰り返される配置傾向を粗く残すための保守的な中間点として採用した。

偶数行では同数をoccupiedにしない。2行中1行だけ埋まる列は `0` とし、曖昧な場合に証拠を強く見積もらない。

### 4. なぜ専用の `multi-row-present` featureを追加しないか

試作時に、prototypeだけが複数本文行を持つ場合に専用featureを持たせると、同じ書式でもobservationが1行しかないだけでJaccard分母が増え、confidenceが不必要に低下することが分かった。

これは「観測できたデータ量の差」を「書式差」と誤って数えることになる。

そのためv5では、行数を表すfeatureは追加せず、1行でも複数行でも同じ規則で得られるmajority maskだけを比較契約へ入れる。

## Feature contract

feature集合の意味が増えるため、`WORKSHEET_FORMAT_FEATURE_VERSION` を `worksheet-format-v5` に上げた。

v4 prototypeとv5 observationは比較しない。既存version gateで明示的に拒否する。

`layout:body-majority-occupancy:*` はセルの存在と相対位置だけから得られるため、source profileでは `structure` evidenceとして扱う。

## Acceptance criteria

- [x] 最大4本文行から相対occupancy majority maskを決定論的に生成する。
- [x] 水平移動してもmaskが変わらない。
- [x] 1本文行しかない同一書式でも、多行prototypeと同じmaskを生成できる。
- [x] 3行中1行だけの空欄は、多数派maskを変えない。
- [x] 3行中2行以上で同じ列が空く場合はmask差として残る。
- [x] 両列名が異なる別表は新feature追加後も`novel`を維持する。
- [x] 本文evidenceが無い観測へmaskを捏造しない。
- [x] 最大観測行数の不正値をfail-closedにする。
- [x] matcherの `minConfidence=0.7` / `minWinnerMargin=0.05` を変更しない。
- [x] feature contractをv5へ上げ、関連version固定テストを同じ変更単位で更新する。
- [x] production経路へ接続しない。
- [x] READMEに背景・入力・変換・出力・非責務を反映する。

## Validation evidence

### 2026-09-17 local validation

実行環境は次のとおりです。

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

v5 adapter / prototype、新規occupancy境界テスト、および既存のadapter回帰テストを同時にコンパイルし、Node test runnerで **20 tests / 20 pass / 0 fail** を確認した。

確認した主な境界は次のとおりです。

| ケース | profile | status | confidence |
|---|---|---|---:|
| 2列・列名1件変更・occupancy一致 | structure only | matched | 0.768627 |
| 上記で3行中1行だけ2列目が空欄 | structure only | matched | 0.768627 |
| 上記で3行中2行以上2列目が空欄 | structure only | novel | 0.671930 |
| 両列名変更・occupancy一致 | structure only | novel | 0.597571 |
| 同一occupancyで本文1行のみ | structure only | matched | 0.768627 |

また、次を確認した。

- 水平移動してもfeature集合は同一。
- 同じoccupancyなら本文1行と本文3行でfeature集合は同一。
- 5行目のoccupancy差は既定4行sampleへ影響しない。
- body evidenceが無い場合、`layout:body-majority-occupancy:*` は生成されない。
- 近接する2候補は引き続き `minWinnerMargin=0.05` の契約で `ambiguous` になる。
- 既存adapterのheader選択、fill drift、入力順不変性、非表形式停止、座標validationも回帰していない。

GitHub Actionsは既知のrunner/resource不足のため完了条件から除外した。

## 判断

v5では、複数本文行から得られる情報を追加しながら、本文行数そのものをformat identityへ混ぜずに済んだ。

単発空欄は吸収し、継続して列occupancyが異なる場合は差として残る。これにより、v4の「最初の1行」という局所観測を、意味推論なしで少し広い構造観測へ拡張できた。

閾値は変更していないため、改善はmatcherを緩くした結果ではなく、観測featureの質を高めた結果である。

## 次段階

次の候補は以下とする。

1. merge配置の粗いshape feature
2. title / header / body以外に明確な区切り領域がある書式のfixture追加
3. それでも不足する場合のみ、値の粗い型パターン
4. 十分なfixtureが揃った後にproduction接続可否を別ADR/Issueで検討
