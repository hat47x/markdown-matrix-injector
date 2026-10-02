# Issue: balance warning の有効性とノイズ率を実務寄りfixtureで評価する

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: balance-warning corpus evaluator, practical fixture evaluation, contributor documentation
- Expected verification level: deterministic corpus evaluation + focused integration check

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0127 Done
- Feature contract: `worksheet-format-v6` のまま
- Production matcher: 変更しない
- Balance gate thresholds: 変更しない

## 背景

issue-0127では、family-normalized / column-family-capped scoringが既存のfail-closed境界を後退させることを確認し、production matcherはflat scoringを維持する判断とした。

代わりに、既存flat結果を変えずに危険箇所だけを可視化する `evaluateWorksheetFormatBalanceGate` をoffline評価用に残した。

ただし、当時のfixtureは少数であり、warningの意味も次の2種類が混在していた。

1. **decision boundaryに近い**
   - `confidence-near-gate`
   - `winner-margin-near-gate`

2. **feature vectorの構成が偏っている**
   - `column-family-share-high`
   - `single-family-share-high`

前者は「この判定は境界に近い」という1ケース単位の性質である。

後者は「この種類の表では特定familyのcardinalityが大きい」という設計上の露出度であり、完全一致のwide tableでも成立し得る。

この2種類をすべて同じ「要レビューwarning」として扱ってよいかを、実務寄りfixtureで測る必要がある。

## 目的

今回の目的はgateを改善することではなく、**現在のwarningが何を得意とし、何を誤って拾い、何を取り逃すかを定量化すること**である。

warningを評価上だけ次の2種類へ分ける。

### boundary warning

- `confidence-near-gate`
- `winner-margin-near-gate`

scoreのaccept / ambiguity境界への近さを表す。

### composition warning

- `column-family-share-high`
- `single-family-share-high`

feature vectorのfamily構成比を表す。

この分類はproduction gateの出力を変更しない。

## 「expectedReview」の定義

fixtureにはgate結果を見る前に `expectedReview` を与える。

ここでいうreviewは、業務上の承認やすべての `novel` の手動処理ではない。

**feature追加やscore設計によって分類が動きやすい、または複数のformat差が重なっており、認識設計者が境界を確認すべきケース**を指す。

### review不要の例

- baselineとの完全一致
- wide tableだが完全一致
- 1列だけの軽微なラベルrename
- fill evidenceだけが取得できない
- 明確に異なり、confidenceも十分低い `novel`
- metadata preambleだけが増え、表本体は不変

### review対象の例

- acceptance gate直近
- near-tied prototype
- wide tableで複数列labelが変わる
- label driftとrecurring occupancy driftが同時に起きる
- label driftとmerge topology差が同時に起きる

## Corpus

16ケースを固定した。

### 6列

1. exact
2. 1 label rename
3. 2 label rename / acceptance gate近傍
4. fill unavailable
5. 1 label rename + recurring occupancy drift
6. clearly different table
7. near-tied prototypes

### 8列

8. exact
9. 1 label rename
10. 2 label drift
11. 3 label drift
12. recurring merge loss + 1 label drift

### 10列

13. exact
14. 1 label rename
15. 3 label drift
16. 4 label drift

加えて、adapter integrationとして6列表へmetadata preambleを3行追加し、feature集合とbalance結果が不変であることを確認する。

## 結果1: 全warningをreview flagにするとrecallは高いがノイズが大きい

`warning.length > 0` をそのままreview flagとみなした結果:

| 指標 | 値 |
|---|---:|
| cases | 16 |
| expected review | 8 |
| flagged | 12 |
| true positive | 7 |
| false positive | 5 |
| false negative | 1 |
| true negative | 3 |
| precision | 0.583333 |
| recall | 0.875000 |
| false-positive rate | 0.625000 |

recallは87.5%だが、flaggedの約42%が今回のラベルではreview不要だった。

## 結果2: boundary warningは高precisionだが低recall

boundary warningだけをreview flagとした場合。

| 指標 | 値 |
|---|---:|
| flagged | 2 |
| true positive | 2 |
| false positive | 0 |
| false negative | 6 |
| true negative | 8 |
| precision | 1.000000 |
| recall | 0.250000 |
| false-positive rate | 0.000000 |

拾った2件は次のとおりです。

- 6列2ラベル変更のnear-gate `novel`
- near-tied prototypeの `ambiguous`

はいずれも妥当だった。

一方、confidenceが0.7から離れていても、複数familyにまたがるdriftは拾えない。

したがってboundary warningは**高精度な補助信号ではあるが、review detectorとしては不足**する。

## 結果3: composition warningはcase判定よりdesign telemetryに近い

composition warningだけの場合。

| 指標 | 値 |
|---|---:|
| flagged | 10 |
| true positive | 5 |
| false positive | 5 |
| false negative | 3 |
| true negative | 3 |
| precision | 0.500000 |
| recall | 0.625000 |
| false-positive rate | 0.625000 |

特に次の安全ケースでも `column-family-share-high` が出る。

- 8列exact
- 10列exact
- 8列1 label rename
- 10列1 label rename

これはwarningが間違っているというより、**「wide tableでは列比例familyが大きい」という表の性質を正しく観測している**。

したがって、composition warningをruntimeの要レビュー判定へ直接読み替えるのが誤りである。

## 結果4: style evidence欠落でもcomposition warningが出る

6列表のbaselineでfillだけを観測できないケース:

```text
status     = matched
confidence = 0.892571
column-family share = 0.521739
```

fill featureが2件消えたことで、列比例familyの**絶対件数は変わっていないのに構成比だけが50%を超える**。

その結果、`column-family-share-high` が出る。

これはcomposition warningが入力profileやevidence availabilityにも影響されることを示す。

したがって、このwarningを個別workbookの異常と解釈しない。

## 結果5: 現在のwarningが取り逃す複合driftがある

6列表は次のとおりです。

- `判定 -> 状態`
- majority occupancy `111111 -> 111110`

を同時に与えたケースは次のとおりです。

```text
status         = matched
confidence     = 0.768919
deviationScore = 0.214286
warnings       = []
```

今回のラベルではreview対象だが、現在のwarningは何も出さない。

confidenceは0.7から0.068919離れているためnear-gateではない。

列数は6で、列比例family shareも0.48のためcomposition閾値を超えない。

このケースから、次に検討すべき信号は単なる閾値幅拡大ではなく、**複数familyにまたがるdriftまたはmatched candidateのdeviation構造**である可能性が高い。

ただし、今回の1ケースから新thresholdを設定してはならない。

## 結果6: metadata preambleはノイズにならない

6列の実務風snapshotについて、表の前にsingle-cell metadata rowを3行追加した。

adapterが生成するfeature集合はpreambleなしと完全一致した。

結果は次のとおりです。

```text
status     = matched
confidence = 1.0
warnings   = []
```

既存の相対位置設計により、表全体の垂直移動はbalance warningを増やさない。

## 判断

### 1. すべてのwarningを1つのreview flagとして扱わない

現行の4 warning codeは意味が異なる。

- boundary: case-localなdecision instability
- composition: feature-design exposure

この意味差を文書・評価上で明示する。

### 2. composition warningはoffline telemetryとして維持する

composition warningは削除しない。

wide tableやstyle evidence欠落時にfamily cardinalityの偏りを観測する目的には有用である。

ただし、自動reject / 自動review queue投入の条件にはしない。

### 3. boundary warningも単独ではreview detectorにしない

precisionは高いがrecall 25%である。

「warningが無い = 安定」とは解釈しない。

### 4. gate thresholdは変更しない

今回の結果だけを使っては次のとおりです。

- nearConfidenceDistanceを広げる
- maxColumnFamilyShareを上げる
- deviationScore thresholdを追加する

といった調整は行わない。

同じcorpusへ合わせるだけのoverfitになるためである。

### 5. 次は複合drift signalを別fixtureで評価する

次Issueでは、今回見つかったfalse negativeを起点にするが、同じ16ケースでthresholdを最適化しない。

候補は次のとおりです。

- matched candidateのDeviationScore帯
- family ablationで複数familyがpenalty方向に働くケース
- observation/prototype間で異なるfamily数
- boundary warningとの組み合わせ

これらを**新しいheld-out fixture群**で比較する。

## Acceptance criteria

- [x] warning codeをboundary / compositionへ評価上分類する
- [x] expectedReviewをwarning結果とは独立に付与する
- [x] 6〜10列を含む16ケースcorpusを固定する
- [x] any-warningのprecision / recall / false-positive rateを記録する
- [x] boundary-onlyのprecision / recallを記録する
- [x] composition-onlyのノイズを記録する
- [x] wide exact matchでもcomposition warningが出ることを固定する
- [x] fill evidence欠落でfamily shareが変動することを記録する
- [x] warningなしで残る複合drift false negativeを固定する
- [x] metadata preambleがfeature / warningを変えないことを確認する
- [x] matcher本体を変更しない
- [x] warning thresholdを変更しない
- [x] feature contractを変更しない
- [x] production経路へ接続しない

## Validation evidence

### 2026-09-18 local validation

実行環境は次のとおりです。

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

確認内容は次のとおりです。

- 新しいcorpus evaluatorをexisting public interfaceに対してstrict compile
- 16ケースのdeterministic corpus replay
- any / boundary / composition metricsの固定
- metadata preambleの相対構造不変性

focused validation: **6 assertions / 6 pass**。

GitHub Actionsは既知のrunner/resource不足があるため完了条件に使用しない。

## 次段階

次は、今回のcorpusでwarning thresholdを調整しない。

独立したheld-out corpusを追加し、**matchedだが複数familyで差異を持つケースを検知するreview signal**を比較する。

そのうえで、

- precisionを大きく落とさずrecallを上げられるか
- wide exact / one-label driftを過剰に拾わないか
- structure-only / structure+fillの双方で成立するか

を確認する。
