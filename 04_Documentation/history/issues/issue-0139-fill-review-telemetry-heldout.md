# Issue: 塗りつぶしの有無と不一致をレビュー用観測情報として独立評価する

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: fill-specific telemetry taxonomy, held-out corpus, contributor documentation
- Feature contract: `worksheet-format-v6` のまま
- Source profile: `sheetjs-ce-xlsx-0.20.3-fill-v1` のまま
- Production matcher: 変更しない

## Traceability
- Depends on: issue-0134 Done
- Avoided concurrent scope: Cognitive Contract / provider interface
- Evaluation helper: `worksheetFormatFillReviewTelemetry.ts`

本Issueでいう**fill**はセルの塗りつぶし、**review telemetry**は候補の確認が必要かを検討するための観測情報、**held-out corpus**は先行評価とは別に用意した評価用データ群を指す。**snapshot**は表の構造や書式を記録した観測データ、**prototype**は既知の書式を表す比較基準、**winner margin**は上位候補間のスコア差である。ここでの評価対象は6列・8列の合成snapshot 20ケースに限られ、実Workbook全体の傾向やproduction環境での効果を示すものではない。

## 背景

issue-0134では、同じsnapshotを「構造と塗りつぶしの両方を使う場合」と「構造だけを使う場合」で比較した。その結果、fill evidence（塗りつぶし由来の比較特徴）には、次のような利点とリスクがあることを確認した。

- fill-onlyでしか区別できないprototypeをdisambiguateできる
- 共通fillが構造差を薄め、novel/matched境界を変える場合がある
- fill欠落がconfidenceを下げる
- structureとfillが異なるcandidateを支持するとwinner marginが狭まる

そこで次に検討したのは、塗りつぶしの有無や違いという事実を、そのままレビューを促すsignalにしてよいか、という点である。

この評価では、**塗りつぶしの有無や不一致を広く検知するだけでは、レビュー不要のケースまで拾いやすい**ことが分かった。

一方、

- fillが実際にstatus/winnerを変えた
- fillが唯一の識別材料なのにobservationから欠けている

といった判定への影響が大きいケースは、レビュー理由として具体的に説明できる。

## 他レーンとの競合回避

当時の作業開始時点で、repositoryの状態を確認した。

- main: `ab73a66712460bc484f6c35ee9a0bc61b222f23a`
- open PR: 0

他チャットではCognitive Contract / provider境界を先行設計中である。

作業途中でPR #176 `docs: establish cognitive assistance plane` が作成・mainへ統合されたことを再確認で検知した。PR #176がissue-0135〜0138を採番したため、本Issueは当初のissue-0135から**issue-0139へ採番し直した**。その後、最新main `4240a43bbbd8f72b8fbdf5ffe1f3cf45ffb432b3` を同一作業ブランチへmergeし、behind 0へ同期してから統合する。

本Issueでは:

- CognitiveObservation
- CognitiveSignal
- provider interface
- Authority Plane / Assistance Plane

等へ一切変更を入れない。

worksheet-format-v6のevaluation layerだけに限定する。

## Telemetry taxonomy

### Decision-impact

次のstatus transitionまたはwinner変化。

#### fill-supported-acceptance

```text
structure only: novel
with fill:      matched
```

#### fill-supported-disambiguation

```text
structure only: ambiguous
with fill:      matched
```

#### fill-induced-ambiguity

```text
structure only: matched
with fill:      ambiguous
```

#### fill-induced-rejection

```text
structure only: matched
with fill:      novel
```

#### fill-changed-winner

top prototype idがstructure-onlyとfill-awareで変わる場合。

### Essential unavailable

#### fill-unavailable-for-discrimination

次をすべて満たす場合。

- observationにmeaningful header fillがない
- structure-only prototypesがfeature上同一
- prototypesに2種類以上のmeaningful fill toneがある
- structure-only / fill-awareの双方がambiguous

これは、

> fillが候補を区別する唯一の材料なのに、その観測が無い

という状態を表す。

### Broad diagnostic facts

#### fill-unavailable

observationにmeaningful fillがなく、prototype側にはfill evidenceがある。

#### fill-tone-disagreement

observation fill toneとstructure-only top candidateのfill toneが異なる。

これらは事実として有用だが、それだけでreview要件とはしない。

## Held-out corpus

issue-0134の3/4列表を再利用しない。

今回は6列・8列で各10ケース、合計20ケース。

### 各幅

1. exact / same dark fill — review不要
2. one-label / same dark fill — review不要
3. two-label / same dark fill — review対象
4. exact structure / dark -> light — review不要
5. exact structure / observation fill missing — review不要
6. one-label / observation fill missing — review不要
7. identical structure dark/light prototypes / dark observation — review対象
8. identical structure dark/light prototypes / fill missing — review対象
9. exact-structure no-fill prototype vs one-label-wrong dark-fill prototype — review対象
10. clearly novel / same dark fill — review不要

合計は次のとおりです。

```text
cases           20
expected review  8
no review       12
```

## 重要な幅依存

同じ「ラベル2件の変更と同一の塗りつぶし」という条件でも、列数によって判定の変化は逆方向になる。

### 6列

```text
structure only: novel
with fill:      matched
```

`fill-supported-acceptance`

### 8列

```text
structure only: matched
with fill:      novel
```

`fill-induced-rejection`

これはglobal sparse signatureとの相互作用を含むため、fillは常にconfidenceを上げるわけではない。

したがって、「塗りつぶし情報があれば常に加点される」という理解は正確ではない。

## Result 1: decision-impact

| metric | value |
|---|---:|
| flagged | 6 |
| true positive | 6 |
| false positive | 0 |
| false negative | 2 |
| precision | 1.000000 |
| recall | 0.750000 |
| false-positive rate | 0.000000 |

取り逃す2件は、fill-only prototypesなのにobservation fillが無いケース。

statusはfill-aware / structure-onlyともambiguousなので、status transitionだけでは観測できない。

## Result 2: essential unavailable

| metric | value |
|---|---:|
| flagged | 2 |
| true positive | 2 |
| false positive | 0 |
| precision | 1.000000 |
| recall | 0.250000 |
| false-positive rate | 0.000000 |

対象は6列・8列のfill-only discriminationでfill observationが欠けた2件。

## Result 3: high-impact telemetry

```text
decision-impact
OR
fill-unavailable-for-discrimination
```

結果は次のとおりです。

| metric | value |
|---|---:|
| flagged | 8 |
| true positive | 8 |
| false positive | 0 |
| false negative | 0 |
| precision | 1.000000 |
| recall | 1.000000 |
| false-positive rate | 0.000000 |

ただし、この評価で全件を正しく識別したという結果を、そのままproduction ruleの採用根拠にはしない。

理由は次のとおりです。

- 20 synthetic snapshot casesのみ
- expectedReviewの設計自体がfill-impact taxonomyと近い
- real workbook distributionを代表していない
- direct RGB / themeはsnapshot上同じcoarse toneへ正規化済み
- border / mixed style / partial header stylingを含まない

この段階での結論は、高影響のreason codeを次の実務データ群で再評価する価値がある、という範囲に留める。

## Result 4: broad fill-unavailable

| metric | value |
|---|---:|
| flagged | 6 |
| true positive | 2 |
| false positive | 4 |
| precision | 0.333333 |
| recall | 0.250000 |
| false-positive rate | 0.333333 |

false positive:

- 6-column missing-fill exact
- 6-column missing-fill one-label
- 8-column missing-fill exact
- 8-column missing-fill one-label

fillが無いという事実だけではreview queueへ送れない。

## Result 5: broad tone disagreement

| metric | value |
|---|---:|
| flagged | 2 |
| true positive | 0 |
| false positive | 2 |
| precision | 0.000000 |
| recall | 0.000000 |
| false-positive rate | 0.166667 |

dark prototypeにlight observationというtone driftだけのケースは、どちらもmatchedのまま。

tone disagreement単独を異常扱いしない。

## Result 6: all telemetryを一括flagするとノイズが戻る

high-impactとbroad factsをすべて同じreview flagへ潰すと:

| metric | value |
|---|---:|
| flagged | 14 |
| true positive | 8 |
| false positive | 6 |
| precision | 0.571429 |
| recall | 1.000000 |
| false-positive rate | 0.500000 |

これはissue-0128のbalance warningで見た問題と同型である。

**意味の違う観測を1つのwarningへ潰さない。**

## 判断

### 1. fill availability / disagreementをproduction warningにしない

広いsignalはノイズが多い。

### 2. high-impact telemetryはevaluation reason codeとして維持

特に、次のケースを区別して扱う。

- acceptance crossing
- disambiguation
- induced ambiguity
- induced rejection
- fill essential but unavailable

は説明可能。

### 3. statusを変更しない

telemetryはmatcher outputを上書きしない。

### 4. fill weightを変更しない

6列と8列で同じfill追加が逆方向に働くため、単純加点設計は不適切。

### 5. direct RGB / themeの由来をこの層で区別しない

issue-0132/0133でparserがcoarse fill toneへ正規化済み。

review telemetry層では:

```text
dark / gray / light / unavailable
```

だけを見る。

provenanceが必要ならreader/observation層で保持するべきであり、format featureへ再埋め込みしない。

## Acceptance criteria

- [x] decision-impact codeをstatus transitionから導出
- [x] fill-changed-winner codeを用意
- [x] broad fill-unavailableを別codeにする
- [x] broad fill-tone-disagreementを別codeにする
- [x] structurally equivalent fill-only prototypesのessential unavailableを検出
- [x] issue-0134と異なる6/8列held-out corpus
- [x] 20 cases / 8 review / 12 no-reviewを固定
- [x] decision-impact metricsを固定
- [x] essential-unavailable metricsを固定
- [x] high-impact union metricsを固定
- [x] broad availabilityのnoiseを固定
- [x] broad disagreementのnoiseを固定
- [x] all-telemetry一括flagのnoiseを固定
- [x] production matcherを変更しない
- [x] source profile / feature versionを変更しない
- [x] Cognitive Contract/provider interfaceを変更しない

## Validation status

expected statuses / confidence境界はcurrent worksheet-format-v6の決定論的logicを独立replayして確認した。

現在の作業環境にはrepository checkout/dependency treeが無いため、repository test suiteのpassはこの場では主張しない。

GitHub Actionsは既知のrunner/resource不足があるため完了条件にしない。

## 次段階

次はtelemetry codeを増やすのではなく、**adapter / external-XLSX由来の実務寄りcorpusへhigh-impact reason codesを適用する**。

優先ケースは次のとおりです。

1. LibreOffice direct RGB fixture由来snapshot
2. LibreOffice theme/tint fixture由来snapshot
3. no-fill / partial-fill
4. multiple prototypes
5. structure near-gate
6. metadata preamble / gapped header

synthetic snapshotだけでperfectだった結果を実務fixtureへ持ち込めるか確認してから、Cognitive Contract側へevent/observationとして露出する必要性を別レーンと調整する。
