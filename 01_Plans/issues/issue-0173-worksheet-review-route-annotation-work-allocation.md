# Issue: Resume-safe worksheet review-route annotation work allocationを実装する

## Meta
- Type: Evaluation data / Annotation workflow hardening
- Status: Open
- Priority: High
- Scope: per-annotator blinded work packet, resume safety, shared independent-annotation requirement
- Expected verification level: unit + focused workflow
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0168 Done
- Depends on: issue-0169 Done
- Depends on: issue-0170 Done
- Related: issue-0171 Worksheet Review Route Evaluation Readiness
- Related: issue-0172 Worksheet Review Route Evaluation Packet
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0169のannotation packetはlabeler-visible evidenceを安全に提示できるが、長時間のlabeling作業を中断・再開する際に:
- 同じannotatorへ既に処理済みcaseを再提示する
- 必要数を満たしたcaseへ3件目以降のannotationを過剰に集める
- adjudication済みcaseを再提示する
- corpus更新後の古いwork responseを適用する

余地がある。

## Decision

annotatorごとに**現在必要な未処理caseだけ**を返す
`WorksheetReviewRouteAnnotationWorkPacketV1` を追加する。

packet生成時にannotatorRefはfilterへ使うが、packet本体へannotator identityは保持しない。

## Shared annotation requirement

独立annotation必要数を:

```ts
WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS = 2
```

としてlabel corpus contractへ集約する。

adjudication packet側のminimumもこの定数を参照する。

これにより:
- label corpus validation
- annotation work allocation
- adjudication eligibility

の必要数が別々にずれない。

## Work eligibility

caseをpacketへ含める条件:

- adjudication未確定。
- current annotations < required independent annotations。
- current annotatorがまだそのcaseをannotationしていない。

したがって:
- 0 annotation caseは最初のannotatorへ提示可能。
- 1 annotation caseは別annotatorへ提示可能。
- 2 annotation caseはadjudicationへhandoffし、annotation workから除外。
- 同一annotatorへ同一caseを再提示しない。

## Packet visibility

含める:
- route definitions。
- requiredIndependentAnnotations。
- case id。
- evidence。

含めない:
- projectionState。
- prior annotations。
- annotator identities。
- adjudication。
- provider/model/result。
- probability/confidence。

## Resume safety

packet digestは:
- representation version。
- labeling protocol version。
- required independent annotation count。
- route definitions。
- current eligible case evidence。

へSHA-256でbindingする。

response apply時にcurrent corpus + response.annotatorRefからpacketを再生成し、
packetDigestが一致しない場合はstale responseとしてrejectする。

## Response

response:
- schemaVersion。
- protocolVersion。
- packetDigest。
- annotatorRef。
- decisions:
  - caseId。
  - route。
  - rationaleCodes。

annotationReferenceは内部生成する。

## Acceptance criteria

- [ ] shared independent annotation countをlabel corpusへ定義。
- [ ] adjudication packet minimumがshared constantを参照。
- [ ] per-annotator work packet schema/version/representationを固定。
- [ ] packetにrequiredIndependentAnnotationsを保持。
- [ ] same annotatorが既に処理したcaseを除外。
- [ ] annotation必要数を満たしたcaseを除外。
- [ ] adjudicated caseを除外。
- [ ] projectionState / prior annotation / identitiesをpacketへ含めない。
- [ ] packet digestへrequired annotation countをbinding。
- [ ] response strict validation。
- [ ] stale responseをreject。
- [ ] unknown/already-labeled/fully-annotated/adjudicated caseをreject。
- [ ] duplicate response decisionをreject。
- [ ] annotationReferenceを内部生成。
- [ ] source corpusをmutateしない。
- [ ] 2 annotations到達後はthird-label oversamplingを防ぐ。
- [ ] resume時にremaining workだけを返す。
- [ ] live provider / production routingを変更しない。

## Validation plan

- fresh annotator gets all under-labeled cases。
- same annotator resume excludes completed cases。
- second annotator gets one-label cases。
- two-label cases disappear from annotation work。
- adjudicated cases disappear。
- packet non-disclosure。
- required-count digest binding。
- stale response rejection。
- immutable apply。
- third-label oversampling prevention。
- shared constant equality with adjudication packet。
- strict response validation。
