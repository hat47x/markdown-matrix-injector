# Issue: v6 feature family の実質的な寄与と列数依存性を評価する

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: experimental feature-family analysis helper, evaluation tests, contributor documentation
- Expected verification level: pure unit + deterministic boundary evaluation

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0125 Done
- Feature contract: `worksheet-format-v6` のまま（feature生成規則は変更しない）

## 背景

v3〜v6では、書式認識を閾値緩和に頼らず改善するため、順に次のstructure evidenceを追加してきた。

1. 列ラベルと相対列位置
2. title / header / body のtable skeleton
3. 複数本文行のmajority occupancy
4. 横方向mergeの相対shape

各追加は個別の境界評価を通しており、単独では安全側の改善になっている。

一方、matcherはfeature familyごとの重みを持たず、正規化されたfeature集合全体をJaccard類似度と疎signatureで比較する。そのため、**familyごとのfeature個数そのものが実質的な重みになり得る**。

特に `column:<label>` と `column-position:<index>:<label>` は列数に比例して増える。一方、table skeletonの多くは列数が増えてもほぼ固定個数である。

この差が、2列表と6列表で同じ種類の変更を与えたときに、confidenceへどの程度影響するかをまず測る必要がある。

## 目的

このIssueではmatcherを変更しない。

行うことは次の2点だけである。

1. 現在のv6 featureを人間が追えるfamilyへ分類し、feature数と構成比を測る。
2. observationとprototypeの双方から1 familyだけを除いて再計算する symmetric ablation により、そのfamilyが対象ペアのconfidenceをどの程度支え、または下げているかを見る。

これは新しいスコア方式ではない。**既存matcherの挙動を観察するための測定器**である。

## Feature family

評価用に次のfamilyへ分ける。

| family | 主なfeature | 意味 |
|---|---|---|
| `semantic-label` | `column:*` | 列ラベル自体 |
| `relative-position` | `column-position:*` | 表左端から見たラベル位置 |
| `table-skeleton` | `region:*`, title/header/body gap, columns, coverage等 | 表全体の配置骨格 |
| `body-occupancy` | `layout:body-majority-occupancy:*` | 本文列の反復occupancy |
| `merge-shape` | `merge:*`, `*horizontal-merge-links:*` | 横方向merge topology |
| `fill` | header fill関連 | fill style evidence |
| `border` | `border:*` | border evidence |
| `other` | 将来の未知feature | 暗黙分類を避ける受け皿 |

`other` を設ける理由は、将来featureが増えたときに既存familyへ勝手に吸収しないためである。分類規則の更新漏れを評価から見つけやすくする。

## symmetric ablation の読み方

あるfamily `F` について、observationとprototypeの**双方**から `F` のfeatureを除き、既存matcherをそのまま再実行する。

```text
confidenceDelta = baselineConfidence - ablatedConfidence
```

- 正: familyがこの候補の類似を支えている
- 負: familyがこの候補に差異を与えている
- 0近傍: このペアでは実効影響が小さい

これは因果的な重要度や最適weightを直接意味しない。feature同士は独立ではなく、疎hashのbucket衝突もあるためである。

したがって、この値をそのままweightへ変換してはならない。

## fixture

現行v6の代表的なfeature vectorを固定し、matcher/cardinalityだけを評価する。

adapterのheader検出やSheetJS bridgeまで同時に動かすと、「feature生成の変化」と「matcherでのfeature構成比」を区別しにくくなるため、このIssueでは**feature-level fixture**を使う。

adapter自体の正しさは既存のadapter / structural / occupancy / merge-shape regressionが担当する。

代表fixture:

- 2列: 設定表 `項目 / 値`
- 3列: コード一覧 `コード / 名称 / 説明`
- 6列: リリース判定表 `ID / 項目 / 判定 / 確認者 / 備考 / 期限`
- 4列: recurring body mergeを持つグルーピング表

## 結果1: family構成比は列数で変わる

fillを含む標準fixtureで得た構成:

| 列数 | total | semantic-label | relative-position | table-skeleton | body-occupancy | fill |
|---:|---:|---:|---:|---:|---:|---:|
| 2 | 17 | 11.76% | 11.76% | 58.82% | 5.88% | 11.76% |
| 3 | 19 | 15.79% | 15.79% | 52.63% | 5.26% | 10.53% |
| 6 | 25 | 24.00% | 24.00% | 40.00% | 4.00% | 8.00% |

`semantic-label + relative-position` を合算すると、2列表では約23.5%だが、6列表では48%になる。

逆にtable skeletonはfeature数が10件でほぼ固定のため、構成比は約58.8%から40%へ低下する。

ここから、現在の「全featureを同じ集合へ入れる」方式では、**表幅によってfamilyの実質的な比重が変わる**ことが確認できる。

## 結果2: 同じ「列名1件変更」でもconfidenceが変わる

各fixtureで1列だけラベルを変更し、他のfeatureを同一にした。

| fixture | 変更 | confidence |
|---|---|---:|
| 2列 | `値` → `内容` | 0.785965 |
| 3列 | `名称` → `表示名` | 0.800000 |
| 6列 | `判定` → `状態` | 0.829630 |

列数が増えるほど、1件のラベル変更が全feature集合に占める割合は小さくなる。

これは直ちに欠陥とは言えない。6列中1列だけ変わった表は、2列中1列が変わった表より「全体として同じ」と判断する合理性もある。

重要なのは、この性質が明示的な設計weightではなく、**feature cardinalityから自然発生している**点である。

## 結果3: 6列表の2ラベル変更が既定gate直下に来る

6列表で2ラベルだけを変更したケース:

```text
判定   -> 状態
確認者 -> 担当者
```

結果:

```text
confidence = 0.699204
status     = novel
```

既定 `minConfidence=0.7` の直下である。

現時点ではfail-closedを維持しているが、hash構成や別familyのfeatureが1件増減しただけでも境界が動き得る距離である。

このため、今後featureを追加する際には「全体feature数が増えたことで既存の境界が偶然押し上げられないか」をfamily単位で確認する必要がある。

## 結果4: ablationでfamilyの実効寄与を観測できる

2列表の `値 -> 内容` 変更:

```text
baseline confidence = 0.785965
```

主なablation:

| familyを除外 | confidenceDelta | 読み方 |
|---|---:|---|
| table-skeleton | +0.230409 | skeleton一致が候補を強く支える |
| semantic-label | -0.091241 | label差が候補を下げる |
| relative-position | -0.091241 | 位置付きlabel差も候補を下げる |
| fill | +0.017338 | fill一致は小さな支持 |
| body-occupancy | +0.008187 | occupancy一致は小さな支持 |

同じ1ラベル変更を6列表で見ると、table-skeletonの `confidenceDelta` は約`+0.061003`まで下がる。

skeletonそのものが弱くなったのではなく、列比例familyが増えたため、全体スコアに占める相対的な影響が薄くなったと読める。

## merge-shapeの例

4列表でprototypeだけが recurring body merge `100` を持ち、observationではmergeが消失し、同時に1ラベル変更があるケース:

```text
baseline confidence = 0.737263
merge-shape ablation confidenceDelta = -0.074331
```

負値なので、このペアではmerge-shape差がconfidenceを下げる方向に働いている。

v6で狙った「merge差を補助evidenceとして残す」動作をfamily単位でも観測できる。

## 判断

### 1. cardinality effectは実在する

family間の比重は固定されておらず、特に表幅で変化する。

これは現在の実装から論理的に予想できるだけでなく、fixtureで数値として確認された。

### 2. ただちにfamily weightingを導入する根拠にはまだ不足する

表幅が広いほど1列変更を軽く見ること自体には合理性がある。

したがって「比重が変わる = bug」とは扱わない。

weightingを入れると、今度は6列表で5列が一致しているという有力な証拠を過小評価する可能性がある。

### 3. 今回は測定器だけを追加する

matcher、閾値、feature contract、source profileは変更しない。

feature contractは引き続き `worksheet-format-v6` である。

### 4. 今後featureを増やす前にfamily balanceを確認する

新feature追加が候補のconfidenceを「内容ではなくfeature件数」で押し上げないかを、このanalysis helperで確認できるようにする。

## Acceptance criteria

- [x] v6 featureを明示的なanalysis familyへ分類できる。
- [x] familyごとのfeature件数と構成比を決定論的に出せる。
- [x] symmetric leave-one-family-outでconfidence変化を測れる。
- [x] 未知featureは`other`へ入り、暗黙に既存familyへ混入しない。
- [x] 2/3/6列fixtureで列数依存の構成比変化を固定する。
- [x] 1ラベル変更のconfidenceが列幅によって変わる現状を回帰として固定する。
- [x] 6列表2ラベル変更が既定gate直下で`novel`になることを固定する。
- [x] merge-shapeの寄与も同じ仕組みで測定できる。
- [x] matcher重み・閾値を変更しない。
- [x] feature contractを変更しない。
- [x] production経路へ接続しない。

## Validation evidence

### 2026-09-17 local validation

実行環境:

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

feature-family analysis helperとfeature-level evaluation suiteをローカルコンパイルし、family share、列幅ごとの1ラベル変更、6列表2ラベル境界、ablationを確認した。

GitHub Actionsは既知のrunner/resource不足があるため完了条件に使用しない。

## 次段階

次はweightを実装するのではなく、**候補方式をofflineで比較する評価Issue**とする。

比較候補:

1. 現行のflat feature Jaccard（baseline）
2. familyごとに類似度を計算して最後に平均するfamily-normalized方式
3. 列比例familyだけ寄与上限を設けるcapped方式
4. 現行方式を維持し、feature追加時のfamily-balance gateだけ導入する方式

実務fixture群でfalse match / false novel / ambiguous境界を比較し、明確な改善が確認できた場合に限って別ADR/Issueでscoring変更を検討する。
