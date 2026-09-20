# Issue: Blinded worksheet review-route annotation packetを実装する

## Meta
- Type: Evaluation data / Annotation workflow
- Status: Open
- Priority: High
- Scope: labeler-visible packet, evidence digest binding, annotation response validation, immutable corpus update
- Expected verification level: unit + focused workflow
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0168 Done
- Related: issue-0167 Worksheet Review Route Evaluation
- Related: issue-0165 Jev Worksheet Review Route
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0168でprovider-blinded corpus schemaを固定したが、labelerへcorpus objectを直接渡すと:
- projectionState
- 既存annotation
- adjudication
が見えてanchoringする余地がある。

また、annotation中にevidenceが変更された場合、古いevidenceを見て付けたlabelを新しいcorpusへ誤適用する危険がある。

## Decision

labelerへ渡す専用 `WorksheetReviewRouteAnnotationPacketV1` を追加する。

packetに含める:
- route definitions
- case id
- evidence

含めない:
- projectionState
- existing annotations
- adjudication
- provider output
- provider/model identity
- probability/confidence

## Evidence binding

packetはlabeler-visible contentからSHA-256 digestを作る。

canonical input:
- representation version
- labeling protocol version
- route definitions
- case id + evidence

case orderやfacts orderの単純な並び替えではdigestを変えないようcanonical sortする。

annotation responseはpacketDigestを必須とする。

corpusへ適用時にcurrent corpusからpacketを再生成し、
response digestと一致しなければstale responseとしてrejectする。

## Response

response:
- schema/protocol version
- packetDigest
- annotatorRef
- decisions
  - caseId
  - route
  - rationaleCodes

annotationReferenceはapply時にdigest/case/annotatorから生成する。
callerが任意annotation provenanceを書き込まない。

## Acceptance criteria

- [ ] annotation packet schema/version/representationを固定。
- [ ] packetは非adjudicated caseだけを含む。
- [ ] packetからprojectionStateを除外。
- [ ] packetからexisting annotation/adjudicationを除外。
- [ ] route definitionsにinspect/routine双方のhuman-review/no-authority semanticsを含める。
- [ ] packet digestをSHA-256で生成。
- [ ] corpus/case/facts orderの単純な並び替えにdigestを依存させない。
- [ ] evidence内容変更ではdigestが変わる。
- [ ] annotation response schemaをstrict validation。
- [ ] unknown response fieldsをreject。
- [ ] response case id重複をreject。
- [ ] unknown/adjudicated caseへのresponseをreject。
- [ ] stale packet digestをreject。
- [ ] same annotatorによる同一case再annotationをreject。
- [ ] annotationReferenceを内部生成。
- [ ] corpusをmutateせず新corpusを返す。
- [ ] apply後corpusをissue-0168 validatorで再検証。
- [ ] provider output/live provider/production routingを追加しない。

## Validation plan

- packet non-disclosure。
- packet route semantics。
- stable canonical digest。
- evidence change digest difference。
- valid response apply。
- stale response reject。
- unknown/adjudicated case reject。
- duplicate decision reject。
- duplicate annotator reject。
- unknown field reject。
- input immutability。
- strict compile。
