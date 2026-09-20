# Worksheet Review Route Adjudication v1

## 1. 目的

independent annotationsを、provider-blindedな最終expected routeへ確定する。

```text
Label Corpus
  |
  | >= 2 independent annotations
  v
Blinded Adjudication Packet
  |
  | evidence + anonymous route/rationale
  v
Independent adjudicator
  |
  | packet digest revalidation
  v
Adjudicated Label Corpus
  |
  v
issue-0167 evaluation
```

## 2. Eligibility

adjudication対象:
- adjudicationなし
- 2件以上のannotation
- annotationのannotatorRefはcorpus validatorでunique

1件だけのannotationは最終ground truthへ昇格させない。

## 3. Adjudicator visibility

見える:
- inspect/routine semantics
- case evidence
- annotationごとのroute/rationale

見えない:
- annotator identity
- annotationReference
- projectionState
- provider output
- provider/model identity
- probability/confidence

## 4. Anonymous annotations

packet内で annotation-1, annotation-2 ... のopaque idを生成する。

canonical sortは:
- route
- sorted rationaleCodes

で行う。
identity/provenanceはsortにも露出しない。

## 5. Digest

SHA-256対象:
- representation version
- labeling protocol
- route definitions
- case evidence
- anonymous annotation route/rationale multiset

順序のみの変更ではdigest不変。
annotation route/rationaleまたはevidence変更ではdigest変化。

## 6. Adjudicator independence

apply時にresponse.adjudicatorRefと元annotationのannotatorRefを比較する。
一致があればreject。

adjudicator identityはpacket生成には使わない。

## 7. Corpus invariant

adjudicationを持つcaseは:
- annotations >= 2
- adjudicatorRef not in annotator refs

を常に満たす。

issue-0168のfinal label extractionはこのvalidatorを通るため、弱いadjudicationはevaluationへ入らない。

## 8. Non-goals

- automatic majority vote
- consensus auto-adjudication
- provider execution
- projection-state judgment
- live Jev
- runtime route policy
- apply authority
