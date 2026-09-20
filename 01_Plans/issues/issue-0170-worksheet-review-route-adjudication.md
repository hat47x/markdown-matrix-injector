# Issue: Worksheet review-routeのblinded adjudication workflowを実装する

## Meta
- Type: Evaluation data / Adjudication workflow
- Status: Open
- Priority: High
- Scope: blinded adjudication packet, two-independent-annotation gate, stale binding, immutable corpus update
- Expected verification level: unit + focused workflow
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0168 Done
- Depends on: issue-0169 Done
- Related: issue-0167 Worksheet Review Route Evaluation
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0169までで独立annotationは収集できるが、最終expected routeを確定するadjudication境界が未定義。

corpusを直接adjudicatorへ渡すと:
- projectionState
- annotator identity
- annotation provenance
- provider-adjacent derived state
が判断へ影響し得る。

また1件だけのannotationをそのままfinal labelへ昇格すると、independent ground truthとして弱い。

## Decision

final adjudication可能条件を次へ固定する。

- 2件以上の異なるannotatorによるannotation。
- adjudicatorはそのcaseのannotatorRefと異なる。
- provider output/model/probability/confidenceは引き続き非表示。
- projectionStateはadjudication packetへ出さない。
- annotator identity / annotationReferenceはpacketへ出さない。
- annotation route + rationaleだけを匿名化して提示。

## Packet

adjudication packet case:
- case id
- evidence
- anonymous annotations
  - annotation-1, annotation-2...
  - route
  - rationaleCodes

含めない:
- projectionState
- annotatorRef
- annotationReference
- existing adjudication
- provider/model/result

2件未満のannotation caseはpacket対象外。

## Digest binding

packetはlabeler-visible:
- route definitions
- evidence
- anonymous annotation content
へSHA-256でbindする。

case order / facts order / annotation order / rationale orderの単純な並び替えではdigestを変えない。
evidenceまたはannotation内容が変わればdigestを変える。

## Response

response:
- schema/protocol version
- packetDigest
- adjudicatorRef
- decisions:
  - caseId
  - route
  - rationaleCodes

adjudicationReferenceは内部生成。

## Corpus hardening

issue-0168 corpus validatorも強化:
- adjudicationは2 independent annotations以上を必須。
- adjudicatorRefはannotatorRef群と異なる。

これによりfinal evaluation label抽出自体が弱いadjudicationを受理しない。

## Acceptance criteria

- [ ] adjudication packet schema/version/representationを固定。
- [ ] 2 annotations未満をpacket対象外。
- [ ] packetからprojectionStateを除外。
- [ ] packetからannotatorRef / annotationReferenceを除外。
- [ ] packetからprovider-adjacent dataを除外。
- [ ] anonymous annotation route/rationaleを提示。
- [ ] packet digestをSHA-256で生成。
- [ ] case/fact/annotation/rationale orderのみの変更でdigest不変。
- [ ] evidence/annotation内容変更でdigest変化。
- [ ] response strict validation。
- [ ] duplicate response caseをreject。
- [ ] unknown/ineligible/already-adjudicated caseをreject。
- [ ] stale responseをreject。
- [ ] adjudicatorが元annotatorならreject。
- [ ] adjudicationReferenceを内部生成。
- [ ] immutable corpus update。
- [ ] apply後corpus validator再検証。
- [ ] corpus validatorで2 annotations minimumを強制。
- [ ] corpus validatorでadjudicator independenceを強制。
- [ ] live provider / auto adjudication / production routingを追加しない。

## Validation plan

- eligible/ineligible packet selection。
- packet non-disclosure。
- digest canonicalization。
- annotation/evidence change stale detection。
- valid adjudication apply。
- same-person adjudicator reject。
- unknown/ineligible case reject。
- duplicate decision reject。
- strengthened corpus validation。
- input immutability。
- strict compile。
