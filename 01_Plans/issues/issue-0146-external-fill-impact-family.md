# Issue: external XLSX template familyで残りのfill decision-impact reasonを固定する

## Meta
- Type: Evaluation / Runtime boundary evidence
- Status: Done
- Priority: High
- Scope: external XLSX fixture family, remaining fill impact reasons, contributor documentation
- Feature contract: `worksheet-format-v6` のまま
- Source profile: `sheetjs-ce-xlsx-0.20.3-fill-v1` のまま
- Production matcher: 変更しない
- Cognitive / Authority contracts: 変更しない

## Traceability
- Depends on: issue-0140 Done
- Related: issue-0139 fill review telemetry taxonomy
- Related: issue-0141 cognitive review envelope
- Related: issue-0142 cognitive review presentation
- Related: issue-0143 authority revalidation receipt
- Related: issue-0144 authority verification overlay

## 背景

issue-0140では既存のLibreOffice external XLSX fixtureをreaderへ通し、

- `fill-supported-disambiguation`
- `fill-unavailable-for-discrimination`
- broad `fill-unavailable`
- broad `fill-tone-disagreement`

をexternal-XLSX由来snapshotで再確認した。

一方、fill review telemetryのhigh-impact reasonにはまだexternal XLSXで未確認のものが残っていた。

```text
fill-supported-acceptance
fill-induced-ambiguity
fill-induced-rejection
fill-changed-winner
```

synthetic snapshotでは確認済みだが、それだけではreader / OOXML / external writer境界を通った契約にはならない。

本Issueでは同じlayout familyを持つ複数sheetを1つのLibreOffice最終保存workbookへまとめ、上記4reasonを実reader経路で再現する。

## 他チャットとの競合回避

作業開始時:

```text
main = a6f43ba8ca49d2d8553daaf6d73a9c2bae9a581a
open PR = 0
```

他レーンではissue-0141〜0144まで、

- cognitive review-only envelope
- UI-neutral review presentation
- Authority revalidation receipt
- Authority verification overlay

がmainへ統合済み。

本Issueでは以下を変更しない。

- Cognitive Contract
- Fly Perception adapter
- Format Profile
- Judgment contract
- cognitive review envelope / presentation
- Authority receipt / overlay
- production runtime

今回のreason codeをCognitive/Authority surfaceへ露出する変更も行わない。

## External fixture

追加fixture:

```text
03_Implement/test/fixtures/
  libreoffice-fill-impact-family.xlsx
```

SHA-256:

```text
aeeb605c4bcd88a02df6ecf09a83db962141d6f6c90bd96375d67feeeb937973
```

生成環境:

```text
LibreOffice 25.2.3.2 520(Build:2)
OpenPyXL 3.1.5
```

生成手順:

1. OpenPyXLで1つのtemplate family workbookを生成
2. 各sheetは共通して:
   - row 1 title merge
   - row 2 contiguous header
   - row 3〜5 full body
3. 必要な差分だけ:
   - header label
   - dark / light / no fill
   に限定
4. LibreOffice CalcでOffice Open XMLへ再保存
5. 最終XLSXをOpenPyXLで独立readback
6. header / fill / mergeを全sheetで再確認
7. 最終binaryをGit data APIでbyte-exactにrepositoryへ格納

## Sheet family

### 6-column base

```text
ID | Item | Type | Required | Decision | Reviewer
```

dark fill.

### 6-column two drift

```text
Code | Item | Name | Required | Decision | Reviewer
```

dark fill.

差分:

- ID -> Code
- Type -> Name

### 6-column no-fill exact prototype

labelsはbaseと同一。
header fillだけ無し。

### 6-column wrong-dark prototype

```text
ID | Item | Type | Required | Decision | Memo
```

dark fill.

### 8-column base

```text
ID | Item | Type | Required | Decision | Reviewer | Note | Owner
```

dark fill.

### 8-column two drift

```text
Status | Item | Type | Required | Decision | Role | Note | Owner
```

dark fill.

差分:

- ID -> Status
- Reviewer -> Role

### 3-column base

```text
ID | State | Note
```

dark fill.

### 3-column candidate A

```text
Code | State | Note
```

dark fill.

### 3-column candidate B

```text
ID | Category | Note
```

light fill.

## Boundary 1: fill-supported-acceptance

Observation:

```text
W6 Two Drift Dark
```

Prototype:

```text
W6 Base Dark
```

expected:

```text
structure only:
  confidence = 0.684900
  status = novel

structure + fill:
  confidence = 0.712160
  status = matched
```

telemetry:

```text
fill-supported-acceptance
```

意味:

共通fillが、structure-onlyではacceptance gate未満だったobservationをmatched側へ押し上げる。

良い／悪いの判定ではなく、decision boundaryへfillが影響した事実を示す。

## Boundary 2: fill-induced-ambiguity

Observation:

```text
W6 Base Dark
```

Prototypes:

```text
A = W6 Base No Fill
B = W6 Wrong Dark
```

structure-only:

```text
A confidence = 1.000000
B confidence = 0.821333
margin       = 0.178667
status       = matched A
```

fill-aware:

```text
A confidence = 0.877333
B confidence = 0.829630
margin       = 0.047703
status       = ambiguous
```

telemetry:

```text
fill-induced-ambiguity
```

意味:

Aはstructureが完全一致するがfillがない。
Bは1 label異なるがdark fillは一致する。

fillがBを支持した結果、winner marginが0.05未満へ縮み、安全側にambiguous停止する。

## Boundary 3: fill-induced-rejection

Observation:

```text
W8 Two Drift Dark
```

Prototype:

```text
W8 Base Dark
```

expected:

```text
structure only:
  confidence = 0.711663
  status = matched

structure + fill:
  confidence = 0.698596
  status = novel
```

telemetry:

```text
fill-induced-rejection
```

重要なのは、observation / prototypeのfillは同じdarkであること。

fill featureを追加しただけでもglobal sparse signatureが変わるため、confidenceは必ず上がるとは限らない。

issue-0139の6列/8列幅依存をexternal XLSXでも固定する。

## Boundary 4: fill-changed-winner

Observation:

```text
W3 Base Dark:
ID | State | Note
```

Candidate A:

```text
W3 A Code Dark:
Code | State | Note
dark
```

Candidate B:

```text
W3 B Category Light:
ID | Category | Note
light
```

structure-only:

```text
top B = 0.801203
A     = 0.785965
margin = 0.015238
status = ambiguous
```

fill-aware:

```text
top A = 0.800000
B     = 0.742424
margin = 0.057576
status = matched A
```

telemetry:

```text
fill-supported-disambiguation
fill-changed-winner
fill-tone-disagreement
```

ここでは単にstatusが変わるだけでなく、top candidate自体がBからAへ変わる。

`fill-changed-winner` はこの候補identity変更を明示するためのreasonである。

## Exact controls

同じfixtureから:

- W6 Base Dark -> W6 Base Dark
- W8 Base Dark -> W8 Base Dark
- W3 Base Dark -> W3 Base Dark

も評価する。

期待:

```text
structure only = matched
with fill      = matched
telemetry      = []
```

reason coverageのために作ったworkbookがexact controlへ余計なsignalを出さないことを確認する。

## Coverage corpusの解釈

7ケース:

```text
expected review = 4
control         = 3
```

decision-impact:

```text
TP = 4
FP = 0
FN = 0
TN = 3
precision = 1
recall = 1
FPR = 0
```

ただし**精度ベンチマークではない**。

このcorpusはreason codeを意図的に1件ずつ再現するcoverage fixtureであり、population distributionから独立に抽出したheld-out corpusではない。

したがって:

> precision 1.0だからproduction gateへ採用する

とは解釈しない。

価値は:

> 4 reason codeがactual external XLSX reader boundaryでも再現する

ことにある。

## Storage form

既存external fixturesは `.xlsx.base64` として保存されている。

今回はGit data APIでbinary blobを直接作成できたため:

```text
libreoffice-fill-impact-family.xlsx
```

を実binaryのまま保存する。

testはSHA-256を最初に確認する。

保存形式が異なってもprovenance契約は同じ。

## 判断

### 1. High-impact taxonomyはreader boundaryでも維持する

4reasonを新しいexternal XLSX familyで固定する。

### 2. Production gateへは昇格しない

reason codeは説明・評価用。

matcher statusを上書きしない。

### 3. Cognitive review envelopeへまだ埋め込まない

issue-0141〜0144のreview / Authority surfaceは安定化したが、fill reasonをそこへ足すことは別のcontract changeである。

本Issueでは見送る。

### 4. Fill weight / thresholdは変更しない

今回も:

- positive effect
- negative effect
- ambiguity effect
- winner change

のすべてが観測される。

単純weight調整は妥当でない。

### 5. Feature/profile versionを変更しない

新しいfeatureやevidence種別は追加していない。

```text
worksheet-format-v6
sheetjs-ce-xlsx-0.20.3-fill-v1
```

を維持する。

## Acceptance criteria

- [x] 同一template familyのexternal XLSXを作成
- [x] LibreOfficeで最終保存
- [x] SHA-256を固定
- [x] 全9 sheetのheader/fill/mergeを独立readback
- [x] binary XLSXをrepositoryへbyte-exact保存
- [x] fill-supported-acceptanceをexternal reader経路でtest化
- [x] fill-induced-ambiguityをexternal reader経路でtest化
- [x] fill-induced-rejectionをexternal reader経路でtest化
- [x] fill-changed-winnerをexternal reader経路でtest化
- [x] changed-winnerでtop candidate idの入れ替わりを確認
- [x] 3/6/8列exact controlを追加
- [x] coverage corpusをprecision benchmarkと誤読しない注記
- [x] production matcherを変更しない
- [x] source profile / feature versionを変更しない
- [x] Cognitive / Authority contractsを変更しない

## Validation status

### 実行済み

現在環境で:

- OpenPyXL source generation
- LibreOffice headless final save
- OpenPyXL final-file readback
- header/fill/merge全sheet確認
- SHA-256計算
- deterministic v6 score式の独立replay

を実行した。

### Repository runtime test

追加testは `readXlsxFormatSnapshot` を使用するためrepositoryの `xlsx@0.20.3` dependencyが必要。

現在の作業環境にはrepository dependency treeが無いため、**test suite passはこの場では主張しない**。

GitHub Actionsは既知のrunner/resource不足があるため完了条件にしない。

## 次段階

4 high-impact reasonがexternal XLSXでも再現したため、次の自然な問いは:

> deterministic review reasonをCognitive review envelopeへどう露出するか

である。

ただし実装へ進む前にissue-0141〜0144の契約を再確認し、

- Authority
- deterministic matcher result
- deterministic review reason
- cognitive Perception/Judgment
- provenance

を混同しない最小surfaceを設計する。

特にreview reasonはCognitive providerが生成したsignalではなく、deterministic matcher comparisonから得たevidenceであるため、provider-owned fieldへ押し込まない。
