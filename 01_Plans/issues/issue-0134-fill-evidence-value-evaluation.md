# Issue: fill evidenceの識別価値と過剰支持リスクを対比較する

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: paired structure+fill / structure-only evaluation
- Feature contract: `worksheet-format-v6` のまま
- Source profile: `sheetjs-ce-xlsx-0.20.3-fill-v1` のまま
- Production matcher: 変更しない

## 背景

issue-0132 / 0133で、direct RGBとtheme/tint由来RGBの双方が既存SheetJS read pathからfill evidenceへ入る境界を確認した。

次に必要なのは、fillを読めることではなく、

> fillを比較evidenceへ入れることが、実際の識別にどのような価値と副作用を持つか

を測ることである。

他レーンではMMIのCognitive Contract設計が進んでいるため、本Issueはprovider/interface設計には触れず、既存worksheet-format-v6 matcherの評価だけに限定する。

## 方針

同じsnapshot / prototype集合を2回評価する。

1. `structure + fill`
2. `structure only`

prototypeは各profileで必ず同じadapterから作り直す。

cross-profile比較は行わない。

追加helper:

```text
worksheetFormatFillEvidenceEvaluation.ts
```

責務:

```text
same snapshots
   |
   +--> structure + fill profile
   |
   +--> structure-only profile
   |
   v
status / top confidence / winner margin を対比較
```

production matcherのscore式・threshold・profileは変更しない。

## 評価ケース

### 1. exact match

dark fillを含む同一表。

```text
structure+fill  1.000000 matched
structure-only  1.000000 matched
```

fillはexact matchを変えない。

### 2. 1 label rename + same fill

4列表で1ラベルだけ変更。

```text
structure+fill  0.811594 matched
structure-only  0.800000 matched
delta          +0.011594
```

fillは弱い支持証拠として働く。

### 3. 2 label rename + same fill

4列表で2ラベル変更。

```text
structure+fill  0.724571 matched
structure-only  0.675441 novel
delta          +0.049130
```

**同じfillが構造差を薄め、fail-closed境界をまたぐ。**

今回もっとも重要なrisk caseである。

### 4. fill tone drift only

構造・labelは同一、dark prototypeに対しlight observation。

```text
structure+fill  0.901070 matched
structure-only  1.000000 matched
```

fill差だけでは別formatへ分離しない。

### 5. fill missing / exact structure

dark prototypeに対しobservationのfillなし。

```text
structure+fill  0.866667 matched
structure-only  1.000000 matched
```

fill-aware profileではevidence欠落がdeviationになる。

### 6. fill missing + 1 label rename

```text
structure+fill  0.736310 matched
structure-only  0.800000 matched
```

fillが観測できないと、同じ構造差でもconfidenceは下がる。

### 7. fill-only prototype discrimination

prototype A/Bは構造が完全に同一で、dark / lightだけ異なる。
observationはdark。

```text
structure+fill:
  dark  = 1.000000
  light = 0.901070
  margin = 0.098930
  -> matched dark

structure-only:
  both = 1.000000
  margin = 0
  -> ambiguous
```

fillは実際に候補識別価値を持つ。

### 8. fill unavailable / fill-only prototypes

observationにfillがなく、prototypeだけdark/light。

structure+fillではsparse signature差によりtop confidenceが完全同値ではないが、marginは `0.015238` に留まり `ambiguous`。

structure-onlyも `ambiguous`。

**fillが観測できない場合にwinnerを強制しない**ことを確認する。

### 9. correct structure has no fill / wrong structure shares fill

3列表。

observation:
- correct structure
- dark fill

prototype A:
- exact structure
- no fill

prototype B:
- 1 label違い
- dark fill

結果:

```text
structure+fill:
  correct = 0.859649
  wrong   = 0.815238
  margin  = 0.044411
  -> ambiguous

structure-only:
  correct = 1.000000
  wrong   = 0.785965
  margin  = 0.214035
  -> matched correct
```

fill一致がwrong candidateを支え、winner marginをambiguity gate未満まで縮める。

これはfillがwinnerを逆転するケースではないが、**candidate separationを弱める具体例**である。

### 10. clearly novel structure + same fill

4列すべてのlabelが異なる。

```text
structure+fill  0.482086 novel
structure-only  0.411852 novel
```

同じfillだけで明確に異なる表を救済することはない。

## 判断

### 1. fill evidenceをsource profileから外さない

理由:

- fill-onlyで区別可能なprototypeを実際にdisambiguateできる
- direct RGB / theme/tintのinput-side contractも外部fixtureで確認済み
- 明確なnovelをfillだけでmatchedへ押し上げるほど強くはない

### 2. fill weightを増やさない

理由:

- 4列2ラベル変更で `novel -> matched` がすでに起きる
- candidate separationを狭めるケースもある

fillは強いidentity keyではなく補助証拠として扱う。

### 3. 現在のflat matcher / thresholdを変更しない

今回の評価はfill固有の相互作用を示したが、単純なweight変更の安全性を示していない。

特にissue-0127でfamily-normalized / capped scoringがfail-closed境界を後退させたため、局所的な補正を即導入しない。

### 4. fill availabilityをquality signalとして別途観測する余地がある

prototypeがfillを持つのにobservationでfillが無い場合、confidenceが下がる。

ただしこれは:

- 本当にformatが変わった
- reader/source側でstyle evidenceが取れない
- workbook側でfillが消えた

を区別しない。

したがって自動rejectには使わない。

## Acceptance criteria

- [x] same snapshotをstructure+fill / structure-onlyで対比較するhelperを追加
- [x] prototypeは各profileで同じadapterから生成
- [x] exact matchを固定
- [x] 1 label renameでfillの弱い支持を固定
- [x] 2 label renameでnovel -> matched反転を固定
- [x] fill tone driftだけではmatched維持を固定
- [x] fill missingのconfidence低下を固定
- [x] fill-only prototype discriminationを固定
- [x] fill unavailable時にambiguousを維持
- [x] fill一致がwinner marginを狭めるケースを固定
- [x] clearly novelがfillだけでは救済されないことを固定
- [x] source profileを変更しない
- [x] matcher / thresholdを変更しない
- [x] feature versionを変更しない
- [x] Cognitive Contract / provider interfaceには触れない

## Validation

score期待値はcurrent v6の決定論的:

- feature Jaccard
- FNV-style sparse projection
- sparse Jaccard
- `0.7 / 0.3` confidence
- `0.7` acceptance gate
- `0.05` winner-margin gate

を独立replayして照合した。

現在の作業環境にはTypeScript 5.8.3 / Node.js 22.16.0があるが、repository checkout / dependency treeを持たないため、repository test suiteのpassはこの場では主張しない。

GitHub Actionsは既知のrunner/resource不足があるため完了条件にしない。

## 次段階

次はfillのweight変更ではなく、**fill availability / fill disagreementをreview telemetryとしてどう観測するか**をheld-out fixtureで評価する。

特に:

1. structureがnear-gateのときだけfill一致がmatchedへ押し上げるケース
2. fill missingがconfidence低下の主因になるケース
3. fill-onlyでdisambiguateしたケース
4. fillとstructureが異なるprototypeを支持するケース
5. direct RGB / theme / no-fillを混ぜた実務寄りcorpus

を分けて観測する。

十分な再現性が出るまではproduction gateへ追加しない。
