# Worksheet Review Route Adjudication Packet v1

## 1. 目的

provider-blindedな独立annotationを、provider情報やannotator identityへ依存せずfinal routeへadjudicateする。

    blinded corpus
       |
       v
    >= 2 independent annotations
       |
       v
    blinded adjudication packet
       |
       v
    human adjudicator
       |
       v
    bound adjudication response
       |
       v
    immutable corpus update
       |
       v
    final expected route

## 2. Packet visibility

表示する:
- route definitions
- case evidence
- anonymous annotation route
- anonymous annotation rationale codes

表示しない:
- projection state
- annotator identity
- annotation provenance reference
- provider output
- provider identity
- model identity
- confidence
- probability
- previous adjudication

## 3. Eligibility

workflow-level minimum:

    minimumAnnotationsPerCase = 2

理由:
- annotation 1件だけをfinal truthへ昇格させない
- independent labeling phaseを実質的に要求する
- corpus schemaの表現力とは別に運用境界を強める

## 4. Anonymous annotation representation

packet annotation:

    {
      route,
      rationaleCodes
    }

annotatorRef / annotationReferenceは含めない。

複数annotationはcanonical semantic orderへsortする。

同一route/rationaleのannotationが2件ある場合、2件として保持する。
件数情報は失わない。

## 5. Digest

representation:

    worksheet-review-route-adjudication-packet-v1

digest input:
- representation
- labeling protocol
- minimum annotation count
- route definitions
- canonical case evidence
- canonical anonymous annotations

SHA-256でpacketDigestを生成。

## 6. Staleness

responseはpacketDigestを必須とする。

apply時:
1. current corpusをvalidate
2. current adjudication packetを再生成
3. response digestと比較
4. mismatchならreject

annotation packet issue-0169と同じstale-response原則をadjudicationにも適用する。

## 7. Adjudicator independence

adjudicatorRefが対象caseのannotatorRefのいずれかと一致した場合はreject。

packetにはannotator identityを出さないが、apply boundaryでは元corpusを使って検証する。

## 8. Final reference

callerはadjudicationReferenceを指定できない。

内部生成:

    adjudication:<packetDigest>:<caseId>:<adjudicatorRef>

provenanceの形式をworkflow側で固定する。

## 9. No automatic consensus

annotationが全員routineでも、自動routine確定しない。

annotationが全員inspectでも、自動inspect確定しない。

多数決も実装しない。

adjudicationは明示的human action。

## 10. Relation to evaluation

issue-0167 evaluationへ渡すground truthはissue-0168 corpusのadjudicationから抽出する。

本workflowは評価指標を計算しない。

adjudicationとprovider evaluationを同じ処理にしないことで、provider結果によるlabel contaminationを避ける。

## 11. Privacy / blinding

provider-blindingはissue-0168のcorpus contractを継承する。

adjudication packetはさらにannotator identityも表示しない。

ただしcase evidence自体はlabelingに必要なため表示する。

## 12. 非責務

- provider quality measurement
- annotator quality measurement
- majority vote
- automatic final route
- production review routing
- apply authority
- external provider invocation
