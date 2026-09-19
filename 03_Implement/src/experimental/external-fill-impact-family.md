# External fill-impact family

この文書は、fill review telemetryの残り4つのdecision-impact reasonをexternal XLSXで再現するfixture familyの読み方を説明します。

## 1. 何を確認するfixtureか

対象:

```text
fill-supported-acceptance
fill-induced-ambiguity
fill-induced-rejection
fill-changed-winner
```

issue-0139ではsynthetic snapshotで確認しました。

issue-0145ではLibreOffice最終保存XLSXをreaderへ通して確認します。

## 2. 1 workbook / 1 family

各sheetは共通して:

```text
row 1: merged title
row 2: contiguous header
row 3-5: full body rows
```

です。

違いは:

- header label
- header fill

だけです。

構造差を増やしすぎず、fillが判定へ与える作用を読みやすくします。

## 3. Supported acceptance

6列表:

```text
base:
ID | Item | Type | Required | Decision | Reviewer

observation:
Code | Item | Name | Required | Decision | Reviewer
```

両方dark。

```text
structure only: novel
with fill:      matched
```

です。

ここではfill一致がacceptance boundaryをまたがせます。

## 4. Induced ambiguity

Observation:

```text
exact 6-column structure + dark
```

Candidate A:

```text
exact structure + no fill
```

Candidate B:

```text
Reviewer -> Memo + dark
```

structure-onlyではAが明確なwinner。

fill-awareではBもfill一致で支持され、marginが0.05未満になりambiguousへ止まります。

## 5. Induced rejection

8列表で2 label drift、fillは両方dark。

それでも:

```text
structure only: matched
with fill:      novel
```

になります。

理由はmatcherがfeature Jaccardだけではなく、全featureから作るsparse signatureも使うためです。

fillは単純な加点ではありません。

## 6. Changed winner

3列表:

```text
observation:
ID | State | Note
dark

A:
Code | State | Note
dark

B:
ID | Category | Note
light
```

structure-only top:

```text
B
```

fill-aware top:

```text
A
```

へ変わります。

このとき:

```text
fill-supported-disambiguation
fill-changed-winner
fill-tone-disagreement
```

が同時に出ます。

それぞれ意味が違います。

- supported-disambiguation: status transition
- changed-winner: top candidate identity change
- tone-disagreement: structure-only top candidateとobservationのfill差

## 7. Exact control

3/6/8列base sheetは自分自身と比較します。

telemetryは空であるべきです。

fixture自体のwidthやfillがsignalを生むわけではないことを確認します。

## 8. 数値を読むときの注意

この7ケースは**coverage corpus**です。

4review caseはreason codeを出すよう意図的に選んでいます。

したがって:

```text
precision = 1
recall = 1
```

でも、実務populationの精度を意味しません。

前段のissue-0139/0140のnoise評価とは役割が違います。

## 9. Binary fixture provenance

fixtureは:

```text
libreoffice-fill-impact-family.xlsx
```

としてbinary保存します。

test実行前にSHA-256:

```text
aeeb605c4bcd88a02df6ecf09a83db962141d6f6c90bd96375d67feeeb937973
```

を検証します。

## 10. Cognitive / Authorityへまだ接続しない

mainにはreview envelopeとAuthority overlayがあります。

しかしfill reasonは:

```text
deterministic comparison evidence
```

であり、Cognitive providerのJudgmentではありません。

将来surfaceへ載せる場合も:

```text
Authority evidence
deterministic matcher result
deterministic review reasons
Perception
Judgment
provider provenance
```

を別欄で扱うべきです。

このfixture familyは、その次の設計判断に必要なevidenceを提供するだけです。
