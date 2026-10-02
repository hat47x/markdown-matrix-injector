# Balance warning evaluation guide

この文書は、worksheet format matcherのbalance warningを読むための手引きです。

対象は実験層の評価担当者です。warningをproductionのaccept / reject条件として扱うための仕様書ではありません。

## 1. 最初に区別すること

現在のwarningは、同じ配列に入っていますが意味は2種類あります。

### Boundary warning

- `confidence-near-gate`
- `winner-margin-near-gate`

これは「現在のscoreがdecision boundaryに近い」という、**その判定1件に固有の情報**です。

### Composition warning

- `column-family-share-high`
- `single-family-share-high`

これは「feature vectorの中で、あるfamilyの割合が大きい」という、**feature設計上の露出度**です。

wide tableが完全一致していてもcomposition warningは出ます。

この2種類を同じ意味で扱わないでください。

## 2. なぜ分ける必要があるのか

16ケースの実務寄りfixtureで、すべてのwarningを「要レビュー」と読み替えた場合。

```text
precision           0.583333
recall              0.875000
false-positive rate 0.625000
```

review対象の多くは拾えますが、review不要ケースもかなり拾います。

主なfalse positiveは:

- 8列exact
- 10列exact
- 8列1 label rename
- 10列1 label rename
- 6列fill unavailable

です。

ほとんどがcomposition warningです。

## 3. Boundary warningの性質

boundary warningだけを見ると:

```text
precision           1.000000
recall              0.250000
false-positive rate 0.000000
```

今回拾ったのはは次のとおりです。

- acceptance gate直近の6列2ラベル変更
- winner margin直近のnear-tied prototype

でした。

この意味では非常に読みやすいwarningです。

ただし、warningが出なかったから安全、とは言えません。

複数familyにまたがる差異があってもconfidenceが0.7から離れていれば何も出ないことがあります。

## 4. Composition warningの性質

composition warningだけを見ると:

```text
precision           0.500000
recall              0.625000
false-positive rate 0.625000
```

この値だけを見ると性能が低く見えますが、目的が異なります。

composition warningはcase detectorではなく、

> この種類のfeature vectorでは、あるfamilyがscoreへ強く影響しやすい

という設計観測です。

たとえば10列表が完全一致していても、列labelとrelative positionがfeature全体の大きな割合を占めること自体は事実です。

それを「workbookが怪しい」と読むのが誤りです。

## 5. Style evidenceが薄いとfamily shareは変わる

6列表でfill evidenceが取れない場合、列関連featureの件数はそのままでも、分母からfill featureが消えます。

そのためcolumn-family shareは上がります。

実fixtureでは:

```text
confidence          0.892571
column-family share 0.521739
status              matched
warning             column-family-share-high
```

となりました。

したがってcomposition warningは、

- workbook structure
- source profile
- 実際に取得できたevidence

の組み合わせを観測していると理解してください。

## 6. 現在もっとも重要なfalse negative

6列表では次のとおりです。

```text
判定 -> 状態
```

というlabel driftに加えて、body majority occupancyが:

```text
111111 -> 111110
```

へ変化するケースです。

結果は次のとおりです。

```text
status         matched
confidence     0.768919
deviationScore 0.214286
warnings       none
```

これは「near gateだけを見る」方式の限界を示します。

confidenceは0.7近傍ではありません。

一方で、labelとbody occupancyという複数familyが同時にずれています。

次の評価対象は、このような**multi-family drift**です。

## 7. ここでDeviationScore閾値を決めない理由

上のケースだけを見ると、

```text
deviationScore >= 0.2
```

をwarningにすればよさそうに見えます。

しかし、それは同じfixtureに合わせたoverfitです。

明確なnovel tableではDeviationScoreがさらに高くても、それは不安定な境界ではなく「十分に違う」という正常な結果です。

また、wide tableでは1 label driftのDeviationScore自体が小さくなります。

したがって、新しいsignalは別のheld-out corpusで比較します。

## 8. Metadata preambleについて

single-cell metadata rowが表の前に増えても、現在のformat featureは絶対行番号ではなく:

- titleとheaderのgap
- headerとbodyのgap
- 表左端からのrelative column

を使います。

そのため、表全体が下へ移動しただけではfeature identityを変えない設計です。

6列表のpreamble 0行 / 3行比較では、同じfeature集合を期待します。

この性質を崩す変更は、balance warning以前にadapter regressionとして扱ってください。

## 9. 評価コードの読み方

### `worksheetFormatBalanceWarningEvaluation.ts`

既存gateを変更せず、corpus評価だけを行います。

主な責務は次のとおりです。

1. warning codeをboundary / compositionへ分類
2. caseごとに既存gateを実行
3. any / boundary / compositionごとにconfusion matrixを計算
4. precision / recall / false-positive rateを返す

### `worksheetFormatBalanceWarningEvaluation.test.ts`

16ケースのcorpusと期待review labelを固定します。

重要なのは、`expectedReview` がwarning結果から決まっていないことです。

先にケースの意味を決め、その後でgateが拾えたかを測ります。

## 10. 指標の読み方

### Precision

warningで拾ったケースのうち、本当にreview対象だった割合です。

高いほどレビュー担当者へのノイズが少なくなります。

### Recall

review対象のうち、warningが拾えた割合です。

高いほど見逃しが少なくなります。

### False-positive rate

review不要ケースのうち、誤ってflagした割合です。

特に自動review queueへつなぐ場合、この値が高いと運用負荷が急増します。

現在はcomposition warningを含めると62.5%なので、自動queue条件にはできません。

## 11. 現時点の運用上の読み替え

現状は次のように読むのが安全です。

```text
boundary warning:
  その判定1件を詳しく見る理由になる
  ただし無警告でも安全保証ではない

composition warning:
  fixture群やfeature設計を分析する理由になる
  個別workbookを自動reviewへ送る理由にはしない

warningなし:
  安定保証ではない
```

## 12. 次の評価

次Issueでは、今回の16ケースでthreshold調整はしません。

新しいheld-out fixture群を用意し、次を比較します。

- matched candidateのDeviationScore
- penalty方向のfamily ablation数
- observation/prototypeで差異を持つfamily数
- boundary warningとの組み合わせ

評価目標はは次のとおりです。

1. boundary warningのprecisionを大きく落とさない
2. multi-family driftのrecallを上げる
3. wide exact / one-label renameを過剰にflagしない
4. style evidence有無で破綻しない

です。

十分な別fixtureで再現できるまでは、新しいthresholdをproduction contractへしません。
