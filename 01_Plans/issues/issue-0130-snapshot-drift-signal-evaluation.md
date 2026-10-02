# Issue: snapshot → adapter → matcher 経路で multi-family drift signal を再評価する

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: snapshot-level evaluation adapter, practical snapshot corpus, contributor documentation
- Expected verification level: deterministic snapshot materialization + signal replay

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0129 Done
- Feature contract: `worksheet-format-v6` のまま
- Production matcher: 変更しない
- Production warning thresholds: 変更しない

## 背景

issue-0129では、feature文字列を直接構成した5 / 7 / 9列のheld-out corpusでmulti-family drift signalを比較した。

そこではは次のとおりです。

- boundary warning: 高precision / low recall
- matched DeviationScore: 差異量には反応するが表幅依存を受ける
- raw different-family count: 差異種類数を比較的安定して捉える
- penalizing ablation-family count: sparse signature再構成のため不安定
- boundary + deviation + different-family count: 18 synthetic casesでは完全

という結果だった。

ただしfeature文字列を直接構成するfixtureでは、次を通していない。

1. `WorksheetFormatSnapshot`
2. header選択
3. title / body gap算出
4. body occupancy majority
5. horizontal merge shape
6. source profileによるevidence filtering
7. prototype作成
8. multiple prototype matching

そこで今回は、**snapshotから既存adapter / prototype / source-profile経路をそのまま通して**同じ傾向が再現するか確認する。

## 目的

新しいscoringやwarningを追加することではない。

次の問いへ答える。

1. raw different-family countはadapterが生成したfeatureでもmulti-family driftを捉えるか
2. DeviationScoreのprofile依存はsnapshot経路でも現れるか
3. ablation countの不安定さは残るか
4. multiple prototypeのambiguityをboundary warningが拾えるか
5. fill evidenceを除外するstructure-only profileでも同じ設計が成立するか

## 実装方針

追加した `worksheetFormatSnapshotDriftEvaluation.ts` は薄い評価adapterである。

データフローは次のとおりです。

```text
WorksheetFormatSnapshot
        |
        v
createWorksheetFormatPrototype
        |
        v
source profile filter
        |
        +--------------------+
        |                    |
        v                    v
prototype              observation
                        |
                        v
matchWorksheetFormatSnapshot
                        |
                        v
comparedFeatures
                        |
                        v
existing multi-family drift evaluator
```

重要なのは、評価側でfeature extractionやsource-profile filteringを再実装していないこと。

既存のは次のとおりです。

- `createWorksheetFormatPrototype`
- `matchWorksheetFormatSnapshot`

をそのまま利用する。

## Corpus

20 cases。

### 9列 structure + fill

1. exact — review不要
2. one-label rename — review不要
3. label + title/header gap — review対象
4. label + first-body gap — review対象
5. label + partial first body coverage — review対象
6. label + majority occupancy drift — review対象
7. label + recurring merge drift — review対象
8. fill unavailable — review不要
9. clearly novel labels — review不要
10. near-tied multiple prototypes — review対象

### 7列 structure only

11. exact — review不要
12. one-label rename — review不要
13. label + title/header gap — review対象
14. label + first-body gap — review対象
15. label + partial first body coverage — review対象
16. label + majority occupancy drift — review対象
17. label + recurring merge drift — review対象
18. two-label drift — review対象
19. clearly novel labels — review不要
20. near-tied multiple prototypes — review対象

合計は次のとおりです。

- cases: 20
- expected review: 13
- no-review: 7

## Source profile

### structure + fill

既存は次のとおりです。

```text
sheetjs-ce-xlsx-0.20.3-fill-v1
evidence = [structure, fill]
```

### structure only

評価用profile:

```text
snapshot-structure-only-v1
evidence = [structure]
```

structure-onlyでもraw snapshot側にはfillを置く。

そのうえでは次のとおりです。

- `rawObservationFeatures` には `header:dark-fill` が存在
- `comparedObservationFeatures` からはfillが除外

されることを固定する。

これにより、評価fixture自身がfillを作らなかったのではなく、**source profile境界で除外された**ことを確認できる。

## Adapterが生成する差異

9列structure+fillの1-label driftに構造差を1つ追加すると、いずれもraw different-family countは3になる。

例は次のとおりです。

### title/header gap

```text
semantic-label
relative-position
table-skeleton
```

### body occupancy

```text
semantic-label
relative-position
body-occupancy
```

### recurring merge

```text
semantic-label
relative-position
merge-shape
```

この結果は、feature文字列を直接構成したissue-0129の設計仮説と一致する。

## 結果1: boundary warning

| 指標 | 値 |
|---|---:|
| cases | 20 |
| expected review | 13 |
| flagged | 4 |
| true positive | 4 |
| false positive | 0 |
| false negative | 9 |
| true negative | 7 |
| precision | 1.000000 |
| recall | 0.307692 |
| false-positive rate | 0.000000 |

拾う主なケースは次のとおりです。

- structure-only label + recurring merge
- structure-only two-label drift
- structure+fill near-tied prototypes
- structure-only near-tied prototypes

従来どおり高precision / low recall。

## 結果2: matched DeviationScore >= 0.18

| 指標 | 値 |
|---|---:|
| flagged | 6 |
| true positive | 6 |
| false positive | 0 |
| false negative | 7 |
| precision | 1.000000 |
| recall | 0.461538 |
| false-positive rate | 0.000000 |

profile差が明確に出る。

### 9列 structure + fill

1 label + body gap:

```text
deviationScore = 0.176471
matchedDeviationHigh = false
```

### 7列 structure only

同種の1 label + body gap:

```text
deviationScore = 0.214286
matchedDeviationHigh = true
```

同じ種類の構造差でも、fill evidenceが比較集合へ入るかどうかでDeviationScoreが変わる。

したがって固定DeviationScore thresholdをprofile横断のreview ruleへ使うには追加証拠が必要。

## 結果3: matched different-family count >= 3

| 指標 | 値 |
|---|---:|
| flagged | 10 |
| true positive | 10 |
| false positive | 0 |
| false negative | 3 |
| precision | 1.000000 |
| recall | 0.769231 |
| false-positive rate | 0.000000 |

次の10ケースすべてでdifferent-family count = 3:

- structure+fill:
  - label + title/header gap
  - label + first-body gap
  - label + partial coverage
  - label + occupancy
  - label + recurring merge
- structure-only:
  - 同じ5種類

つまり、**差異の種類を数えるsignalは、fill evidence有無よりも安定している**。

ただしsame-family内の差異量は数えない。

例: structure-only two-label driftは:

```text
differentFamilyCount = 2
```

であり、family count単独では拾えない。

## 結果4: penalizing ablation-family count >= 3

| 指標 | 値 |
|---|---:|
| flagged | 8 |
| true positive | 7 |
| false positive | 1 |
| false negative | 6 |
| true negative | 6 |
| precision | 0.875000 |
| recall | 0.538462 |
| false-positive rate | 0.142857 |

false positive:

```text
fill one-label rename
expectedReview = false
differentFamilyCount = 2
penalizingFamilyCount = 4
```

issue-0129と同様、ablation confidenceの符号はraw feature differenceと一致しない。

snapshot adapterを通してもこの問題は残った。

したがってablationは引き続き**寄与診断用**であり、drift種類数の代替にはしない。

## 結果5: 組み合わせ

### boundary OR deviation

| 指標 | 値 |
|---|---:|
| precision | 1.000000 |
| recall | 0.615385 |
| false-positive rate | 0.000000 |

### boundary OR different-family count

| 指標 | 値 |
|---|---:|
| flagged | 13 |
| true positive | 13 |
| false positive | 0 |
| false negative | 0 |
| precision | 1.000000 |
| recall | 1.000000 |
| false-positive rate | 0.000000 |

### boundary OR deviation OR different-family count

同じくは次のとおりです。

```text
precision = 1.0
recall    = 1.0
FPR       = 0
```

今回はDeviationScoreを追加しなくても、boundary + raw different-family countで20ケースすべてを説明できた。

## 結果6: fill unavailableは誤flagしない

9列structure+fill prototypeに対し、observationのheader fillだけを欠落させた。

結果は次のとおりです。

```text
status               = matched
confidence           = 0.888172
differentFamilyCount = 1
review signal        = false
```

fill evidence欠落はfamily差として観測されるが、countは1なのでmulti-family driftとは扱われない。

## 結果7: multiple prototype ambiguity

9列structure+fill / 7列structure-onlyの双方で:

- prototype A: `値`
- prototype B: `説明`
- observation: `内容`

というnear-tied候補を作った。

いずれも `ambiguous` となり、winner-margin boundary warningがreview signalになる。

snapshot-levelでもmultiple prototype条件を評価できることを確認した。

## 判断

### 1. raw different-family countはsnapshot経路でも有望

synthetic feature fixtureだけの偶然ではなく:

- adapter
- source profile
- prototype builder
- matcher

を通しても同じ方向性が再現した。

### 2. DeviationScore固定値はprofile依存を受ける

同種のdriftでもfill evidenceが入ると全feature集合の分母が増え、DeviationScoreが薄まる。

0.18をproduction thresholdへ昇格させない。

### 3. ablation countはreview detectorに採用しない

snapshot-levelでもfalse positiveが残る。

ablation自体はfamily寄与の説明には有用なので削除しない。

### 4. boundary + different-family countをまだproduction化しない

20 casesでperfectでも、まだ次が不足している。

- real SheetJS runtime snapshot
- workbook由来の自然な空欄分布
- titleなしの表
- header gapped layout
- vertical/rectangular mergeを含む入力
- 多数のknown prototype
- source-profile別の実データ分布

したがってreview-only production signalへ昇格させない。

## Acceptance criteria

- [x] snapshotからadapterを通してfeatureを生成する
- [x] prototypeも同じadapterから作る
- [x] source profile filteringを既存実装で行う
- [x] structure + fill / structure-only双方を含める
- [x] title/header gapを含める
- [x] first-body gapを含める
- [x] partial first-body coverageを含める
- [x] majority occupancy driftを含める
- [x] recurring merge driftを含める
- [x] fill unavailableを含める
- [x] multiple prototype ambiguityを含める
- [x] boundary / DeviationScore / family count / ablation countを比較する
- [x] profile差によるDeviationScore変動を固定する
- [x] raw different-family countのprofile横断再現を固定する
- [x] matcher / adapter / profile / warning thresholdを変更しない
- [x] feature contractを変更しない
- [x] production経路へ接続しない

## Validation evidence

### 2026-09-18 deterministic replay

current v6の:

- adapter規則
- source-profile filtering
- FNV-style sparse projection
- Jaccard scoring
- balance gate
- multi-family signal規則

と同じ決定論的処理を独立再計算し、20ケースのexpected metricsを照合した。

追加testはrepository側で同じpublic APIを直接呼び出す形にしている。

GitHub Actionsは既知のrunner/resource不足があるため完了条件に使用しない。

## 次段階

次に必要なのは、fixture generatorをさらに複雑にすることではなく、**実SheetJS readerが生成するsnapshotとの接続確認**である。

優先順位は次のとおりです。

1. 実XLSX fixtureをreaderへ通す
2. merge subordinate cell / blank cellの実際のsnapshot形状を確認する
3. style取得可能性をsource profileどおり再確認する
4. titleなし / header gapped / metadata preambleを実ファイルで確認する
5. snapshot-level signal結果と今回のsynthetic snapshot結果を比較する
6. その後に初めてreview-only signalのADR検討可否を判断する
