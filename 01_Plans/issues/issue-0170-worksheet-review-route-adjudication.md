# Issue: Worksheet review-routeのblinded adjudication workflowを実装する

## Meta
- Type: Evaluation data / Adjudication workflow
- Status: Done
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

- [x] adjudication packet schema/version/representationを固定。
- [x] 2 annotations未満をpacket対象外。
- [x] packetからprojectionStateを除外。
- [x] packetからannotatorRef / annotationReferenceを除外。
- [x] packetからprovider-adjacent dataを除外。
- [x] anonymous annotation route/rationaleを提示。
- [x] packet digestをSHA-256で生成。
- [x] case/fact/annotation/rationale orderのみの変更でdigest不変。
- [x] evidence/annotation内容変更でdigest変化。
- [x] response strict validation。
- [x] duplicate response caseをreject。
- [x] unknown/ineligible/already-adjudicated caseをreject。
- [x] stale responseをreject。
- [x] adjudicatorが元annotatorならreject。
- [x] adjudicationReferenceを内部生成。
- [x] immutable corpus update。
- [x] apply後corpus validator再検証。
- [x] corpus validatorで2 annotations minimumを強制。
- [x] corpus validatorでadjudicator independenceを強制。
- [x] live provider / auto adjudication / production routingを追加しない。

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


## Validation evidence

### 2026-09-20 focused validation

- Node.js runtime: local focused harness。
- TypeScript: `5.8.3`。
- `worksheetReviewRouteAdjudication.ts` を公開interface互換stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - case/facts/annotation/rationale order変更でpacket digest不変。
  - valid responseをimmutableにapply。
  - adjudicatorが元annotatorの場合をreject。
  - annotation内容変更後のstale responseをreject。
- repository test sourceで追加固定:
  - 2 annotations未満をadjudication packet対象外。
  - projectionState / annotatorRef / annotationReference / adjudicated caseをpacketへ保持しない。
  - evidenceまたはannotation内容変更でdigest変化。
  - unknown/ineligible/already-adjudicated caseをreject。
  - duplicate adjudication decisionをreject。
  - unknown provider-like response fieldをreject。
- `assertWorksheetReviewRouteLabelCorpus` を強化:
  - adjudicationには2件以上のindependent annotations必須。
  - adjudicatorRefはannotatorRef群と異なることを必須。
- issue-0168の閉じた仕様文書も0170 invariantへ整合済み。
- majority vote / consensus auto-adjudicationは実装していない。
- live provider / projection-state judgment / production routing / apply authorityは追加していない。
- repository dependency treeは現環境に無いためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
