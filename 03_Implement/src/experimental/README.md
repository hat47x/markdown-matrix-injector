# Fly-inspired worksheet format recognition

このディレクトリは、Excel設計書の書式候補を**読み取り専用で補助判定する実験層**です。

Markdown Matrix Injector本体の決定論的な読み込み・変換・Markdown生成経路とは分離されています。ここで得た候補が、Excel、format definition、Markdownを自動変更することはありません。

このREADMEは、ハエ脳、FlyHash、SheetJS内部実装を事前に知らなくても、通常のTypeScriptとExcelデータ処理の知識から安全に参画できることを目的にしています。

## 1. 最初に理解すること

この実験層が答える問いは1つです。

> 今回のworksheetは、既知のどの書式に近いか。あるいは、安全に既知書式へ分類できないか。

結果は次の3種類です。

- `matched`: 1つの既知書式へ十分近く、他候補との差も十分ある
- `ambiguous`: 既知候補としては十分近いが、上位候補の差が小さく1つへ決められない
- `novel`: 既知書式と呼べるだけの証拠が足りない

`novel`と`ambiguous`は異常ではありません。誤認識を避けるためのfail-closed結果です。

## 2. データフロー

```text
XLSX
  |
  v
SheetJS read-only reader
  |
  v
WorksheetFormatSnapshot
  |  cell text / row / column / merge / optional style
  v
worksheetFormatFeatureAdapter
  |  書式を表す抽象featureへ変換
  v
source profile filter
  |  入力経路で保証されるevidenceだけ残す
  +-----------------------+
  |                       |
  v                       v
known prototype       observation
  |                       |
  +-----------+-----------+
              |
              v
flyInspiredFormatMatcher
  |  deterministic sparse projection + similarity + gates
  v
matched / ambiguous / novel
```

各層の責務を混ぜないことが最重要ルールです。

## 3. ファイルごとの役割

### `flyInspiredFormatMatcher.ts`

抽象feature文字列だけを扱います。Excel、セル、SheetJS、styleを知りません。

処理は通常の計算機科学用語で説明できます。

1. featureを正規化する
2. 安定hashで固定次元へ複数投影する
3. activationの強いbucketだけを残す
4. feature集合と疎signatureのJaccard類似度を計算する
5. confidence / DeviationScoreを作る
6. `minConfidence` と `minWinnerMargin` で3状態へ分類する

「Fly-inspired」は着想元です。SNN、connectome simulation、学習済みモデルを実行しているわけではありません。

### `worksheetFormatFeatureAdapter.ts`

`WorksheetFormatSnapshot`をmatcher向けfeatureへ変換します。

現在の主なstructure feature:

- header列ラベル
- 表左端からの相対列位置
- headerが連続かgappedか
- title mergeのheader重なり幅
- titleとheaderの行間隔
- 最初の本文候補行が存在するか
- headerから最初の本文候補行までの行間隔
- 最初の本文候補行がheader列をfullに埋めるかpartialか
- 本文先頭側の複数行で、各header列が過半数の行に出現するか

style evidenceとしてfill / borderも受け取れますが、実際に比較へ使えるかはsource profileが決めます。

### `worksheetFormatPrototype.ts`

prototype作成、feature contract version、source profile境界を担当します。

prototypeは手書きfeature一覧にしません。必ず観測と同じadapterへbaseline snapshotを通して作ります。

## 4. v4までの table skeleton evidence

v4では、2列表のように列ラベルだけでは情報量が少ないケースを支えるため、**表の意味ではなく、タイトル→ヘッダー→本文という配置骨格**を追加しました。

### `layout:title-header-gap:<n>`

title mergeとheaderの間に何行あるかを表します。隣接していれば0です。

### `body:present`

headerより下、かつ表の水平範囲内に非空セルがあることを表します。

### `layout:first-body-gap:<n>`

headerと最初の本文候補行の間に何行あるかを表します。

### `layout:first-body-coverage:full|partial`

最初の本文候補行が、headerで実際に使われている列をすべて埋めているかを表します。

これらは値の意味を推論するfeatureではありません。`30`が数値かコードか、`01`がIDか数値かは判断しません。

## 5. v5の body majority occupancy

`worksheet-format-v5`では、最初の本文行だけでなく、複数本文行に繰り返される**列の埋まり方**を1つのstructure featureへ圧縮します。

```text
layout:body-majority-occupancy:<bits>
```

2列表なら、たとえば次のようになります。

```text
項目 | 値
-----+----
a    | 1
b    |
c    | 3
```

2列目は3行中2行で埋まっているので、majority occupancyは次です。

```text
layout:body-majority-occupancy:11
```

一方、2列目が3行中1行しか埋まっていなければ次になります。

```text
layout:body-majority-occupancy:10
```

### 判定規則

headerより下で、headerの水平範囲内に非空セルを持つ本文候補行を上から最大4行まで観測します。

各header列について、観測行の**過半数**に非空セルがあれば `1`、それ以外なら `0` とします。

偶数行でちょうど半数の場合は `0` です。曖昧な証拠を強く見積もらないための保守的な扱いです。

### なぜ本文行数をfeatureにしないのか

同じ書式でも、あるファイルでは3件、別のファイルでは1件しかデータがないことがあります。

そこで、`body:rows:3`のようなfeatureは作りません。1行しか観測できない場合も、その1行から同じmajority maskを作ります。

このため、同じ列が埋まっている1行表と3行表は、行数の違いだけでは別書式になりません。

### なぜ最大4行なのか

目的はデータ解析ではなく、表の先頭側に現れる書式傾向の補助観測です。

全行を走査すると、大きなworksheetで不要なコストが増え、footerや別領域まで書式evidenceへ混ぜる危険も高まります。現段階では4行を上限とし、変更が必要なら独立Issueで評価します。

## 6. なぜ絶対行列番号を使わないのか

同じ書式がA列開始でもE列開始でも、通常は同じ表です。

そのため列位置は表左端からの相対位置を使います。また、title/bodyの行位置も絶対行番号ではなくheaderとの距離を使います。

body majority occupancyもExcel上の絶対列番号ではなく、**headerで実際に使われている列の順番**をbit位置として使います。

水平・垂直に表全体が移動しただけで書式identityを変えないためです。

## 7. Source profile

source profileは、入力経路ごとに「どのevidenceを比較契約へ含めてよいか」を決めます。

現在の保守的なSheetJS CE XLSX 0.20.3 profile:

```text
structure: yes
fill:      yes
border:    no
```

`layout:body-majority-occupancy:*`はセル文字列の有無と位置だけから得られるため、`structure` evidenceとして扱います。

adapterが値を受け取れることと、実入力経路がその値を安定して供給することは別です。後者を確認できない情報は比較契約へ入れません。

## 8. Feature contract version

`WORKSHEET_FORMAT_FEATURE_VERSION`は表示用ではありません。

featureの種類や意味が変わると、旧prototypeと新observationのDeviationScoreを同じ尺度として扱えなくなるため、version不一致は比較前に拒否します。

v5ではbody majority occupancyが加わったため、v4 prototypeとv5 observationは比較しません。

featureを変更した場合は、少なくとも次を同じ変更単位で確認してください。

1. adapterの出力
2. `WORKSHEET_FORMAT_FEATURE_VERSION`
3. prototypeのversion gate
4. version固定値を持つ既存回帰
5. boundary evaluation
6. このREADMEと関連Issue

## 9. matcherの既定境界

```text
minConfidence = 0.7
minWinnerMargin = 0.05
```

概念的な判定順序:

```text
best confidence < 0.7
    -> novel

bestは0.7以上だが、secondとの差 < 0.05
    -> ambiguous

otherwise
    -> matched
```

疎hashではbucket衝突のため、意味上対称な2候補でもconfidenceが完全同値とは限りません。したがってambiguousの契約は「同点」ではなく**上位差が `minWinnerMargin` 未満**であることです。

## 10. 現在分かっている境界

### 2列表の列名1件変更

基準:

```text
項目 | 値
-----+----
timeout | 30
```

観測:

```text
項目 | 内容
-----+-----
timeout | 30
```

v5では、`structure only`でもtable skeletonとoccupancyが一致するため、ローカル境界評価では confidence `0.768627` で候補として残ります。

### 単発の空欄

3本文行のうち1行だけ同じ列が空欄でも、残る2行で埋まっていればmajority maskは変わりません。偶発的な空欄に過敏にならないためです。

### 継続するoccupancy差

2列表で、2列目が3行中2行以上欠け、同時に列名も1件変わるケースでは、structure-onlyのconfidenceはローカル評価で `0.671930` となり `novel` を維持します。

また、両列名が異なる別表は `0.597571` で `novel` のままです。

つまりv5は、共有evidenceを増やして何でも既知へ寄せるのではなく、**繰り返し観測できる配置傾向が一致するときだけ追加の支持材料にする**設計です。

## 11. テストを読む順番

初めて参画する場合は次の順を推奨します。

1. `worksheetFormatFeatureAdapter.test.ts` — snapshotから基本featureがどう作られるか
2. `worksheetFormatStructuralFeatures.test.ts` — 相対位置、gap、title/body skeleton
3. `worksheetFormatBodyOccupancy.test.ts` — 複数本文行のoccupancyをどう粗くまとめるか
4. `worksheetFormatHierarchy.test.ts` — 粗いfeatureと細かいfeatureをなぜ重ねるか
5. `worksheetFormatPrototype.test.ts` — source profileとversion gate
6. `worksheetFormatBoundaryEvaluation.test.ts` — 何を吸収し、どこで止まるか
7. `flyInspiredFormatMatcher.test.ts` — matcher一般規則

## 12. 安全に変更するためのチェックリスト

- 変更はreader / adapter / profile / matcherのどの層かを明示したか
- 別層の責務を持ち込んでいないか
- 同じ入力から同じfeatureが得られるか
- 絶対行列位置へ不必要に依存していないか
- データ件数そのものをformat identityへ混入させていないか
- prototypeとobservationが同じadapterを通るか
- 観測できないevidenceを補完・推測していないか
- `novel` / `ambiguous`を閾値緩和で安易に`matched`へしていないか
- feature意味変更時にversionを上げたか
- 既存version固定テストを更新したか
- 境界テストに「似ている例」と「似ていない例」の両方があるか
- 専門用語を通常の実装用語でも説明したか
- GitHub Actionsが使えない場合、ローカルstrict compileと関連testを記録したか

## 13. この層が行わないこと

- Excelを書き換える
- format definitionを書き換える
- Markdownを書き換える
- 候補を自動採用してproduction処理を進める
- LLMや外部APIへデータを送る
- 実行ごとに学習して挙動を変える
- セル値の業務上の意味を推論する

この非責務が変わる場合は、実装Issueではなくアーキテクチャ変更として扱ってください。

## 14. 次に改善する場合

v5の次候補も、まず意味推論を伴わないstructure evidenceです。

1. merge配置の粗いshape
2. title/header/body以外の明確な区切り構造
3. それでも不足する場合のみ、値の粗い型パターン
4. 十分なfixtureが揃った後にproduction接続可否を別ADR/Issueで検討

値の型を扱う場合も、「書式の形」を補助する範囲に留め、決定論的format parserの責務と混同しないことが前提です。
