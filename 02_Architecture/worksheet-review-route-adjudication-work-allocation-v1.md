# Worksheet Review Route Adjudication Work Allocation v1

## 1. 目的

issue-0170のblinded adjudicationを、担当者ごとにresume-safeなwork allocationへ拡張する。

    label corpus
         |
         v
    issue-0170 global adjudication packet
         |
         +-- current adjudicatorが元annotator?
         |       yes -> exclude before presentation
         |       no  -> visible work
         v
    adjudication work packet
         |
         v
    partial response
         |
         v
    issue-0170 canonical apply

## 2. 責務分離

### issue-0170

何をadjudication可能とするか、最終adjudicationをどう適用するか。

### issue-0175

そのadjudication可能caseのうち、**特定adjudicatorへ今見せてよいもの**を選ぶ。

issue-0175はfinal adjudication semanticsを所有しない。

## 3. Packet contract

    WorksheetReviewRouteAdjudicationWorkPacketV1
    ├─ schemaVersion
    ├─ protocolVersion
    ├─ representation
    ├─ purpose = blinded-adjudication-work
    ├─ packetDigest
    ├─ minimumAnnotationsPerCase
    ├─ routes
    └─ cases

packetにadjudicatorRefは存在しない。

## 4. Eligibility

caseがvisibleになる条件:

    not adjudicated
    AND annotations >= required independent annotation count
    AND no annotation.annotatorRef == current adjudicatorRef

self-review禁止をapply時だけでなくpresentation前にも適用する。

## 5. Digest semantics

digestはcurrent adjudicatorのvisible work stateへbindingする。

入力:

- work representation
- labeling protocol
- required annotation count
- route definitions
- eligible visible case projection

adjudicatorRefは含めない。

同じvisible workを受けるadjudicator同士では同じdigestになる。

## 6. Resume

work responseはpacket全caseの完了を要求しない。

subsetをapplyした後、current corpusから同じadjudicatorRefでpacketを再生成する。

完了済みcaseはadjudication済みとなり、resume packetから消える。

## 7. Stale safety

response apply時にはcurrent corpusからwork packetを再生成する。

digest mismatch:

    reject stale response

visible eligible setが変化した場合にのみwork packetを失効させる。

self-ineligibleでpacketに見えていないcaseの変更は、visible work digestへ影響させない。

## 8. Canonical apply delegation

work response検証後:

1. current issue-0170 global packetを生成
2. global packet digestを使うcanonical responseへ変換
3. applyWorksheetReviewRouteAdjudicationResponseへ委譲

これにより:

- adjudicationReference
- strict self-review defense
- immutable update
- label corpus validator

はissue-0170へ一本化する。

## 9. Blinding

visible packetへ出さない:

- adjudicator identity
- annotator identity
- annotationReference
- projectionState
- provider output
- provider/model identity
- probability/confidence

匿名化annotation route/rationaleはissue-0170と同じ意味で表示する。

## 10. Concurrency scope

本contractはoptimistic stale detectionであり、分散lockではない。

複数adjudicatorが同じcaseを同時取得した場合:

- 先にapplyしたresponseがcorpusを更新
- 後続responseはcurrent work packet digest mismatchでstale reject

を基本とする。

lease / lock / timeout / assignment reservationは非責務。

## 11. Route semantics

inspect / routineとも:

- human review required
- apply authority = none
- automatic decision = none

allocationはroute meaningを変更しない。

## 12. 非責務

- automatic consensus
- adjudicator quality score
- adjudicator ranking
- UI queue
- persistent task assignment DB
- live provider call
- production routing
- apply authority
