# Issue: Blinded worksheet review-route annotation packetを実装する

## Meta
- Type: Evaluation data / Annotation workflow
- Status: Done
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

- [x] annotation packet schema/version/representationを固定。
- [x] packetは非adjudicated caseだけを含む。
- [x] packetからprojectionStateを除外。
- [x] packetからexisting annotation/adjudicationを除外。
- [x] route definitionsにinspect/routine双方のhuman-review/no-authority semanticsを含める。
- [x] packet digestをSHA-256で生成。
- [x] corpus/case/facts orderの単純な並び替えにdigestを依存させない。
- [x] evidence内容変更ではdigestが変わる。
- [x] annotation response schemaをstrict validation。
- [x] unknown response fieldsをreject。
- [x] response case id重複をreject。
- [x] unknown/adjudicated caseへのresponseをreject。
- [x] stale packet digestをreject。
- [x] same annotatorによる同一case再annotationをreject。
- [x] annotationReferenceを内部生成。
- [x] corpusをmutateせず新corpusを返す。
- [x] apply後corpusをissue-0168 validatorで再検証。
- [x] provider output/live provider/production routingを追加しない。

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


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub上の `worksheetReviewRouteAnnotationPacket.ts` 本体を公開interface互換stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime validation:
  - packetはnon-adjudicated caseのみを含む。
  - packetにprojectionState / prior annotation / adjudicationを保持しない。
  - packet digestは `sha256:<64 hex>`。
  - case order / facts order変更ではdigest不変。
  - evidence内容変更ではdigest変化。
  - response applyはsource corpusをmutateしない。
  - evidence変更後のstale responseをreject。
  - adjudicated caseへのdecisionをreject。
  - duplicate response decisionをreject。
- route definitions:
  - inspect = elevated human review / no rejection semantics。
  - routine = standard human review / no acceptance or apply semantics。
  - 両方 `humanReviewRequired=true / applyAuthority=none / automaticDecision=none`。
- annotation referenceはpacketDigest / caseId / annotatorRefから内部生成。
- provider output / confidence / model identity / live providerをpacket workflowへ追加していない。
- adjudication自体は本Issueの責務外。
- repository dependency treeは現環境に無いためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
