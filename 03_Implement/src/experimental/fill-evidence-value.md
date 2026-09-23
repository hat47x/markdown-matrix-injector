# Fill evidence value evaluation

この文書は、worksheet-format matcherでfill evidenceを「読めるか」ではなく「使うと何が起きるか」を理解するための手引きです。

## 1. 結論

fill evidenceには識別価値があります。

同時に、共通fillは構造差を相対的に薄めます。

したがって現在の方針は:

```text
fillを削除しない
fillを強くしない
補助証拠として維持する
structureとの相互作用を評価する
```

です。

## 2. 対比較の仕組み

`worksheetFormatFillEvidenceEvaluation.ts` は同じsnapshotを2経路でreplayします。

```text
                +--> structure + fill
same snapshots -+
                +--> structure only
```

prototypeは経路ごとに作り直します。

source-profile mismatchを無視して比較する仕組みではありません。

## 3. fillが役立つケース

構造が同一の2prototype:

```text
A: dark
B: light
```

observationがdarkなら:

```text
with fill:
  A 1.000000
  B 0.901070
  margin 0.098930
  -> matched A

structure only:
  A 1.000000
  B 1.000000
  -> ambiguous
```

このケースではfillが唯一の識別材料です。

## 4. fillが構造差を薄めるケース

4列表でprototypeとobservationが同じdark fillを持ち、2ラベルが異なる場合:

```text
structure only:
  0.675441 -> novel

structure + fill:
  0.724571 -> matched
```

fillは正しく一致しています。

しかし「fillが一致する」ことと「同じformatである」ことは同義ではありません。

そのためfill weightを増やす設計は危険です。

## 5. fill欠落の意味

prototypeにdark fillがあり、observationでfillが取れない場合:

```text
exact structure:
  with fill     0.866667
  structure     1.000000

one label drift:
  with fill     0.736310
  structure     0.800000
```

fill-aware profileでは欠落自体が差になります。

ただし原因は:

- workbookからfillが消えた
- input sourceがstyleを供給しない
- readerが解決できなかった

のいずれもあり得ます。

自動的にformat driftと断定しません。

## 6. candidate marginへの影響

fillはtop confidenceだけでなく候補間marginにも影響します。

3列の例:

```text
observation:
  exact structure + dark

candidate A:
  exact structure + no fill

candidate B:
  one-label drift + dark
```

structure onlyならAが明確に勝ちます。

```text
margin = 0.214035
matched
```

fill込みではBもfill一致で支えられ:

```text
margin = 0.044411
ambiguous
```

になります。

これは安全側の停止ですが、fillが候補順位の分離を変えることを示します。

## 7. sparse signatureに注意

observationでfillが無いのにdark/light prototypeを比較すると、feature Jaccard上は同程度でもsparse signatureのbucket差でconfidenceが少し異なることがあります。

今回:

```text
top confidence = 0.881905
second         = 0.866667
margin         = 0.015238
```

です。

winner-margin gateによりambiguousのまま止まります。

「fillが無いのにtop candidateが出た」ことをwinner確定と読まないでください。

## 8. production判断

変更しません。

```text
profile:
  structure + fill 維持

matcher:
  flat scoring 維持

minConfidence:
  0.7 維持

minWinnerMargin:
  0.05 維持

worksheet-format:
  v6 維持
```

## 9. 次に見るsignal

今後評価するならfillそのもののweightではなく:

- fill availability
- fill disagreement
- fill-only discrimination
- structure near-gate + fill support
- structure/fillが別candidateを支持する場合

をreview telemetryとして観測します。

production accept/rejectへ直接つなげません。
