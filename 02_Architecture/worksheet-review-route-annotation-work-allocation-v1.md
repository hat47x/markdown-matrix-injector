# Worksheet Review Route Annotation Work Allocation v1

## 1. 目的

blinded annotationを中断・再開しても、同じannotatorへ処理済みcaseを再提示せず、必要な独立annotation数を超えてlabelを集めない。

```text
Label Corpus
  |
  | current annotator ref is filter-only
  v
Resume-safe Annotation Work Packet
  |
  | evidence + route definitions
  | no prior labels / identities
  v
Annotation Response
  |
  | digest revalidation
  v
Immutable Corpus Update
```

## 2. Shared requirement

```text
WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS = 2
```

をsingle source of truthとする。

この値をは次のとおりです。
- corpus adjudication invariant
- annotation work eligibility
- adjudication packet minimum

が共有する。

## 3. Work selection

```text
eligible =
  not adjudicated
  AND annotations < required
  AND current annotator has not annotated case
```

work allocationはcaseのrouteを推測しない。

## 4. Blinding

packetへ含めない:
- current annotatorRef。
- existing annotatorRef。
- prior route/rationale。
- projectionState。
- provider/model data。
- adjudication。

annotatorRefはwork filterとresponse provenanceにだけ使用する。

## 5. Resume semantics

同じannotatorが1回目responseをapplyした後でpacketを再生成すると、そのannotatorが処理済みのcaseは消える。

別annotatorで生成すれば、まだ必要数に達していないcaseは引き続き提示される。

必要数に到達したcaseは誰に対してもannotation workから消え、issue-0170 adjudication対象へ進む。

## 6. Digest binding

digest input:
- representation。
- labeling protocol。
- required annotation count。
- canonical route definitions。
- canonical eligible case evidence。

case/factsの単純な順序差はcanonicalization対象。

eligible setやevidenceが変わればdigestが変わる。

## 7. Stale response

apply時にcurrent corpusから同じannotatorRefでwork packetを再生成し、
response.packetDigestと比較する。

途中では次のとおりです。
- 他annotatorがlabel追加。
- evidence変更。
- adjudication追加。
- required annotation policy変更。

があれば古いresponseをrejectできる。

## 8. No third-label oversampling

必要数2に到達したcaseはwork packetへ出ない。

これは「2人が常に正しい」という意味ではない。
final expected routeはissue-0170の独立adjudicatorが確定する。

## 9. 非責務

- automatic consensus。
- annotator ranking。
- adjudication。
- provider execution。
- production routing。
- apply authority。
