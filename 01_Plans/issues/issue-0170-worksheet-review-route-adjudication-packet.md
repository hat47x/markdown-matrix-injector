# Issue: Blinded worksheet review-route adjudication packetを実装する

## Meta
- Type: Evaluation data / Adjudication workflow
- Status: Done
- Priority: High
- Scope: adjudicator-visible packet, annotation/evidence digest binding, final route application
- Expected verification level: unit + focused workflow
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0168 Done
- Depends on: issue-0169 Done
- Related: issue-0167 Worksheet Review Route Evaluation
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0169でprovider-blinded annotation packetとimmutable annotation applyまでは実装した。

一方、issue-0168 corpusのfinal expected routeはadjudication済みcaseからのみ抽出されるため、独立annotationをfinal routeへ変換するadjudication workflowが必要。

corpus objectをそのままadjudicatorへ渡すと:
- projectionState
- annotator identity
- annotationReference
- provider由来field
- 既存adjudication

などが見えてanchoringする余地がある。

またannotation後にevidenceやannotation内容が変わった場合、古い判断を新corpusへ適用してはいけない。

## Decision

専用の `WorksheetReviewRouteAdjudicationPacketV1` を追加する。

packetに含める:
- route definitions
- case id
- evidence
- 匿名化した独立annotation
  - route
  - rationaleCodes

packetに含めない:
- projectionState
- annotatorRef
- annotationReference
- existing adjudication
- provider output
- provider/model identity
- probability/confidence

## Eligibility

adjudication対象は:
- adjudication未確定
- 独立annotationが2件以上

のcaseだけ。

`WORKSHEET_REVIEW_ROUTE_MIN_ANNOTATIONS_FOR_ADJUDICATION = 2` を固定する。

corpus schema自体は1 annotationでもadjudicationを表現できるが、本workflowはより強い運用境界として2件以上を要求する。

## Annotation anonymity

adjudicatorへはannotation route / rationaleのみを渡し、annotator identityを渡さない。

annotation順もsemantic canonical orderへ並べ替える。

したがって:
- annotator Aだから重視する
- annotationReferenceの順で推測する

といったidentity-based anchoringを抑える。

## Evidence + annotation binding

packet digestはSHA-256。

canonical input:
- representation version
- labeling protocol version
- minimum annotations
- route definitions
- case id
- evidence
- anonymized annotation route/rationale集合

case order / evidence facts order / annotation order / rationale orderの単純な並べ替えではdigestを変えない。

次の場合はdigestを変える:
- evidence内容変更
- annotation route変更
- annotation rationale変更
- annotation追加/削除

## Response

response:
- schemaVersion
- protocolVersion
- packetDigest
- adjudicatorRef
- decisions
  - caseId
  - route
  - rationaleCodes

callerは `adjudicationReference` を渡さない。

apply時に内部生成する。

## Self-review prohibition

adjudicatorRefが対象caseの既存annotatorRefと一致する場合はrejectする。

adjudicator packetにはannotatorRefを表示しないが、apply時にはcorpusの元annotationと照合できる。

## Stale response

apply時にcurrent corpusからpacketを再生成する。

current packet digestとresponse.packetDigestが一致しなければstale responseとしてrejectする。

これによりannotation後の:
- evidence変更
- annotation変更
- annotation追加
- adjudication追加

を検出する。

## Immutable apply

source corpusをmutateしない。

adjudicationを付けた新しいcorpusを返し、最後にissue-0168のstrict corpus validatorを再実行する。

## Final label extraction

apply後は既存:
- `getAdjudicatedWorksheetReviewRouteLabels`
- `getAdjudicatedWorksheetReviewRouteProjectionCases`

をそのまま利用できる。

adjudication workflow自身はissue-0167の評価器を呼ばない。

## Route semantics

inspect / routine双方:
- human review required
- apply authority = none
- automatic decision = none

inspectはrejectを意味しない。

routineはaccept / approve / applyを意味しない。

## Non-goals

- majority vote自動化
- consensusによる自動確定
- provider outputの参照
- provider/model identityの参照
- probability/confidenceの参照
- production routing
- apply authority
- live Jev call
- annotator quality scoring
- adjudicator ranking
- UI実装

## Acceptance criteria

- [x] adjudication packet schema/version/representationを固定
- [x] 2 annotation以上の未adjudicated caseだけをpacketへ含める
- [x] projectionStateをpacketから除外
- [x] annotatorRefをpacketから除外
- [x] annotationReferenceをpacketから除外
- [x] provider/model/probability/confidenceをpacketへ含めない
- [x] annotation route/rationaleはadjudicatorへ提示
- [x] route definitionsはhuman-review/no-authority semanticsを維持
- [x] packet digestをSHA-256で生成
- [x] case/facts/annotation/rationale order変更ではdigest不変
- [x] evidence変更でdigest変化
- [x] annotation変更でdigest変化
- [x] responseをstrict validation
- [x] unknown response fieldsをreject
- [x] duplicate decisionをreject
- [x] unknown/ineligible/already-adjudicated caseをreject
- [x] stale responseをreject
- [x] adjudicator self-reviewをreject
- [x] adjudicationReferenceを内部生成
- [x] source corpusをmutateしない
- [x] apply後corpusをstrict validatorで再検証
- [x] final label extractionが既存APIで可能
- [x] production runtimeを変更しない

## Validation plan

- packet eligibility
- packet non-disclosure
- anonymous annotation projection
- route semantics
- stable canonical digest
- evidence change digest difference
- annotation change digest difference
- valid response apply
- final label extraction
- stale evidence response reject
- stale annotation response reject
- one-label-only case reject
- already adjudicated case reject
- unknown case reject
- adjudicator self-review reject
- duplicate decision reject
- unknown field reject
- input immutability
- strict compile

## Validation policy

GitHub Actionsの既知runner/resource不足は完了条件にしない。

repository dependency treeが無い場合はrepository全test passを主張せず、strict compile / focused harness / source-level contract inspectionを記録する。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- container側に `@types/node` が無いため、`node:crypto` / `node:assert/strict` の最小型宣言だけをstubし、新module本体を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **5 checks / 5 pass / 0 fail**。
  - 2 annotation以上のeligible caseだけをpacketへ含める。
  - packet serializationへannotator identityを出さない。
  - case/facts/annotation order変更でpacket digest不変。
  - valid responseをimmutableにapplyしsource corpusを変更しない。
  - annotation content変更後のresponseをstaleとしてreject。
  - adjudicatorが元annotatorの場合をreject。
- repository test sourceではさらに:
  - unanimous annotation caseも自動確定せずpacketへ残す。
  - evidence変更でdigest変化。
  - annotation route変更でdigest変化。
  - one-label-only / already-adjudicated / unknown case reject。
  - duplicate response decision reject。
  - unknown response field reject。
  - apply後に既存final label extraction APIでexpected routeを取得。
  - route semanticsはinspect/routineともhuman-review-only / no apply authority / no automatic decision。
- provider output / provider identity / model identity / probability / confidence / projectionState / annotatorRef / annotationReferenceをadjudication packetへ追加していない。
- majority vote / unanimous auto-finalization / live provider / production routingは追加していない。
- repository dependency treeは現環境に無いためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
