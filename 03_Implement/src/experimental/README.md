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

style evidenceとしてfill / borderも受け取れますが、実際に比較へ使えるかはsource profileが決めます。

### `worksheetFormatPrototype.ts`

prototype作成、feature contract version、source profile境界を担当します。

prototypeは手書きfeature一覧にしません。必ず観測と同じadapterへbaseline snapshotを通して作ります。

## 4. v4の table skeleton evidence

`worksheet-format-v4`では、2列表のように列ラベルだけでは情報量が少ないケースを支えるため、**表の意味ではなく、タイトル→ヘッダー→本文という配置骨格**を追加しました。

### `layout:title-header-gap:<n>`

title mergeとheaderの間に何行あるかを表します。隣接していれば0です。

### `body:present`

headerより下、かつ表の水平範囲内に非空セルがあることを表します。

### `layout:first-body-gap:<n>`

headerと最初の本文候補行の間に何行あるかを表します。

### `layout:first-body-coverage:full|partial`

最初の本文候補行が、headerで実際に使われている列をすべて埋めているかを表します。

これは値の意味を推論するfeatureではありません。`30`が数値かコードか、`01`がIDか数値かは判断しません。

## 5. なぜ絶対行列番号を使わないのか

同じ書式がA列開始でもE列開始でも、通常は同じ表です。

そのため列位置は表左端からの相対位置を使います。また、title/bodyの行位置も絶対行番号ではなくheaderとの距離を使います。

水平・垂直に表全体が移動しただけで書式identityを変えないためです。

## 6. Source profile

source profileは、入力経路ごとに「どのevidenceを比較契約へ含めてよいか」を決めます。

現在の保守的なSheetJS CE XLSX 0.20.3 profile:

```text
structure: yes
fill:      yes
border:    no
```

adapterが値を受け取れることと、実入力経路がその値を安定して供給することは別です。後者を確認できない情報は比較契約へ入れません。

## 7. Feature contract version

`WORKSHEET_FORMAT_FEATURE_VERSION`は表示用ではありません。

featureの種類や意味が変わると、旧prototypeと新observationのDeviationScoreを同じ尺度として扱えなくなるため、version不一致は比較前に拒否します。

featureを変更した場合は、少なくとも次を同じ変更単位で確認してください。

1. adapterの出力
2. `WORKSHEET_FORMAT_FEATURE_VERSION`
3. prototypeのversion gate
4. version固定値を持つ既存回帰
5. boundary evaluation
6. このREADMEと関連Issue

## 8. matcherの既定境界

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

## 9. 現在分かっている境界

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

v4では、`structure only`でもtable skeletonが一致するため confidence `0.758333` で候補として回復します。

ただし次は引き続き `novel` です。

- 両方の列名が異なる
- 本文開始位置が大きくずれる
- 最初の本文行のcoverageが変わる
- 本文evidence自体を観測できない

つまり「情報が少なくても何とか既知へ押し込む」のではなく、実際に共通する骨格がある場合だけ追加evidenceとして使います。

### 3列以上

列名1件程度の揺れは、structure onlyでも既知候補として残せるケースがあります。header gap等の大きな構造差は `novel` を維持します。

## 10. テストを読む順番

初めて参画する場合は次の順を推奨します。

1. `worksheetFormatFeatureAdapter.test.ts` — snapshotから基本featureがどう作られるか
2. `worksheetFormatStructuralFeatures.test.ts` — 相対位置、gap、title/body skeleton
3. `worksheetFormatHierarchy.test.ts` — 粗いfeatureと細かいfeatureをなぜ重ねるか
4. `worksheetFormatPrototype.test.ts` — source profileとversion gate
5. `worksheetFormatBoundaryEvaluation.test.ts` — 何を吸収し、どこで止まるか
6. `flyInspiredFormatMatcher.test.ts` — matcher一般規則

## 11. 安全に変更するためのチェックリスト

- 変更はreader / adapter / profile / matcherのどの層かを明示したか
- 別層の責務を持ち込んでいないか
- 同じ入力から同じfeatureが得られるか
- 絶対行列位置へ不必要に依存していないか
- prototypeとobservationが同じadapterを通るか
- 観測できないevidenceを補完・推測していないか
- `novel` / `ambiguous`を閾値緩和で安易に`matched`へしていないか
- feature意味変更時にversionを上げたか
- 既存version固定テストを更新したか
- 境界テストに「似ている例」と「似ていない例」の両方があるか
- 専門用語を通常の実装用語でも説明したか
- GitHub Actionsが使えない場合、ローカルstrict compileと関連testを記録したか

## 12. この層が行わないこと

- Excelを書き換える
- format definitionを書き換える
- Markdownを書き換える
- 候補を自動採用してproduction処理を進める
- LLMや外部APIへデータを送る
- 実行ごとに学習して挙動を変える

この非責務が変わる場合は、実装Issueではなくアーキテクチャ変更として扱ってください。

## 13. 次に改善する場合

v4の次候補は、まず意味推論を伴わないstructure evidenceです。

1. 複数本文行のoccupancy pattern
2. merge配置の粗いshape
3. それでも不足する場合のみ、値の粗い型パターン

値の型を扱う場合も、「書式の形」を補助する範囲に留め、決定論的format parserの責務と混同しないことが前提です。
