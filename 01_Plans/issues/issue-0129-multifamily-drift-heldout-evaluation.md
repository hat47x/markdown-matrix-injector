# Issue: multi-family drift signalをheld-out fixtureで比較する

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: held-out drift evaluator, independent fixture corpus, contributor documentation
- Expected verification level: strict TypeScript compile + deterministic held-out replay

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0128 Done
- Feature contract: `worksheet-format-v6` のまま
- Production matcher: 変更しない
- Production warning thresholds: 変更しない

## 背景

issue-0128では、既存balance warningを6 / 8 / 10列の16ケースで評価した。

そこで次が分かった。

- boundary warningはprecision 1.0だがrecall 0.25
- composition warningは個別caseのreview判定ではなくdesign telemetryとして読むべき
- warningが無くても、label drift + occupancy driftのようなmulti-family driftが残る
- 同じcorpusへthresholdを合わせ込むべきではない

したがって本Issueでは、issue-0128の16ケースを使わず、**独立した5 / 7 / 9列のheld-out corpus**を作り、multi-family driftを拾う候補signalを比較する。

## 目的

次のsignalを比較する。

1. 既存boundary warning
2. matched candidateのDeviationScore
3. observation / prototypeで差異を持つfeature family数
4. family ablationでconfidenceを下げる方向に働くfamily数
5. 1〜3を組み合わせたreview signal

production判定は変更しない。

このIssueの出力は、次の設計判断のための**評価証拠**である。

## Held-out corpus

issue-0128で使用した6 / 8 / 10列は使わない。

今回は次の3幅を使う。

- 5列: structure + fill
- 7列: structure only
- 9列: structure + fill

各幅で6ケース、合計18ケース。

### 各幅の6ケース

1. exact match — review不要
2. one-label rename — review不要
3. one-label rename + majority occupancy drift — review対象
4. one-label rename + recurring merge drift — review対象
5. clearly novel labels — review不要
6. two-label drift — review対象

合計:

- 18 cases
- expected review: 9
- expected no-review: 9

7列表ではprototype / observation双方からfill featureを除き、structure-only条件にしている。

## なぜ5 / 7 / 9列なのか

前Issueの6 / 8 / 10列から表幅をずらし、同じ具体fixtureへの最適化を避けるためである。

また奇数幅を使うことで、単に前回のfeature countを再現するのではなく、cardinalityが異なる条件でsignalを再評価できる。

## Signal 1: boundary warning

既存:

- `confidence-near-gate`
- `winner-margin-near-gate`

結果:

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 0.333333 |
| false-positive rate | 0.000000 |

前Issueと同様、高precision / low recallだった。

5列two-label drift、7列label+merge、7列two-label driftを拾う。

## Signal 2: matched DeviationScore >= 0.18

比較用の固定値として `0.18` を置く。

これはproduction thresholdではない。

明確なnovelをreview signalへ混ぜないため、`matched` のtop candidateだけを対象にする。

結果:

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 0.666667 |
| false-positive rate | 0.000000 |

boundary warningよりrecallは上がる。

ただし9列では:

- label + occupancy: DeviationScore `0.176471`
- label + merge: DeviationScore `0.171429`

となり、multi-family driftでも0.18未満になる。

したがって固定DeviationScoreだけではwide tableで再びcardinality effectを受ける。

## Signal 3: matched different-family count >= 3

observation / prototypeでfeature集合が異なるfamily数を数える。

重要な点:

1ラベル変更は現在の表現では次の2 familyへ現れる。

- `semantic-label`
- `relative-position`

したがってdifferent-family count = 2は、必ずしも2種類の独立driftを意味しない。

本比較では3以上を、

> label表現の2 familyに加えて、occupancy / merge等の別familyにも差異がある

という粗いmulti-family signalとして使う。

結果:

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 0.666667 |
| false-positive rate | 0.000000 |

DeviationScoreとは取り逃すケースが異なる。

- 9列 label + occupancy を拾う
- 9列 label + merge を拾う
- 9列 two-label driftはfamily数2なので拾わない

つまり**差異の種類数**には強いが、同一family内で複数labelが変わる量的driftには弱い。

## Signal 4: penalizing ablation-family count >= 3

issue-0126で導入したsymmetric family ablationについて、

```text
confidenceDelta < 0
```

となるfamily数を数える。

結果:

| 指標 | 値 |
|---|---:|
| precision | 0.833333 |
| recall | 0.555556 |
| false-positive rate | 0.111111 |

今回比較した単純signalの中では劣った。

### false positive

5列のone-label rename:

```text
differentFamilyCount = 2
penalizingFamilyCount = 3
```

labelの2 familyしか実際には異ならないが、疎signatureを含むconfidence再計算ではfill familyを外したときにもablation方向が負になる。

### false negative

9列のlabel + merge drift:

```text
differentFamilyCount = 3
penalizingFamilyCount = 1
```

実際には:

- semantic-label
- relative-position
- merge-shape

の3 familyが異なるが、ablation confidenceの符号ではmerge-shapeしかpenaltyとして残らない。

この結果から、**ablationのconfidenceDelta符号をfamily差の個数として読むのは不安定**である。

ablationは寄与診断には有用だが、review detectorのcount sourceには向かない可能性が高い。

## 組み合わせ

### boundary OR deviation

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 0.777778 |
| false-positive rate | 0.000000 |

### boundary OR different-family count

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 0.888889 |
| false-positive rate | 0.000000 |

9列two-label driftだけを取り逃す。

### boundary OR deviation OR different-family count

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 1.000000 |
| false-positive rate | 0.000000 |

18ケースでは全review対象を拾い、false positiveも無かった。

## 重要: 1.0 / 1.0をproduction採用根拠にしない

この結果をそのままproduction ruleへ昇格させてはならない。

理由:

1. held-outではあるが18ケースと小さい
2. feature-level synthetic fixtureである
3. `DeviationScore >= 0.18` は候補値であり、十分な外部根拠を持つ契約値ではない
4. different-family count >= 3も現在のfeature taxonomyに依存する
5. 将来feature familyが増えるとcountの意味が変わる
6. exact / one-label / clearly-novelという代表ケース中心であり、実際のExcel設計書の分布をまだ代表していない

したがって今回の結論は、

> multi-family driftのreview signalとして、raw family difference countはablation sign countより安定しており、DeviationScoreと補完関係がある

までとする。

## 実装上の位置づけ

追加した `worksheetFormatMultiFamilyDriftEvaluation.ts` はevaluation helperである。

行わないこと:

- matcherのstatusを変更する
- warningをproductionへ追加する
- DeviationScore thresholdで自動rejectする
- family countで自動review queueへ送る
- source profileを変更する
- feature versionを上げる
- workbook / Markdown経路へ接続する

## Acceptance criteria

- [x] issue-0128とは異なる5 / 7 / 9列held-out corpusを用意する
- [x] structure + fill / structure-onlyの双方を含める
- [x] exact / one-label / multi-family / clearly novel / multi-labelを含める
- [x] boundary warningのheld-out metricsを固定する
- [x] matched DeviationScore候補のmetricsを固定する
- [x] raw different-family countのmetricsを固定する
- [x] penalizing ablation-family countのmetricsを固定する
- [x] ablation countのfalse positive / false negativeを具体例で固定する
- [x] signal組み合わせのmetricsを固定する
- [x] 完全なheld-out結果をproduction contractへ昇格させない
- [x] matcher本体を変更しない
- [x] warning thresholdを変更しない
- [x] feature contractを変更しない
- [x] production経路へ接続しない

## Validation evidence

### 2026-09-18 local validation

実行環境:

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

ローカルでcurrent matcher / family analysis / balance-gate contractと同じ決定論的ロジックへ新helperを接続し、5 / 7 / 9列18ケースをreplayした。

確認結果:

- TypeScript strict compile成功
- held-out corpus replay成功
- signal metrics 7系列を固定
- ablation countの5列false positiveを確認
- ablation countの9列merge false negativeを確認

focused held-out checks: **9 / 9 pass**。

GitHub Actionsは既知のrunner/resource不足があるため完了条件に使用しない。

## 次段階

次にproduction warningへ追加するのではなく、次の順で証拠を増やす。

1. feature-level synthetic fixtureではなく、adapterから生成するsnapshot fixtureへ移す
2. one-label + occupancy / merge以外にtitle gap / header gap / body coverage差も入れる
3. prototypeを複数置き、winner identityが変わるケースを含める
4. structure-only / structure+fillを同じcase familyで比較する
5. different-family countの意味がsource evidence差で変わらないか確認する
6. 十分なfixtureで再現した場合のみ、review-only signalを別ADR/Issueで検討する

現時点では、**production flat matcherと既存warningを維持し、multi-family signalは評価層に留める**。
