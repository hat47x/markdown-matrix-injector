# Issue: Resume-safe worksheet review-route adjudication work allocationを実装する

## Meta
- Type: Evaluation data / Adjudication workflow hardening
- Status: Done
- Priority: High
- Scope: per-adjudicator blinded work packet, self-review prevention before presentation, resume safety
- Expected verification level: unit + focused workflow
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0168 Done
- Depends on: issue-0170 Done
- Depends on: issue-0173 Done
- Related: issue-0174 Worksheet Review Route Evaluation Runner
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0170のadjudication packetは、2件以上の独立annotationを持つ未adjudicated caseをblindに提示し、apply時にはadjudicatorが元annotatorならrejectする。

ただしpacket生成時点ではadjudicatorRefを知らないため、元annotator本人へself-review対象caseを表示してからapplyで拒否する余地がある。

また、長時間のadjudication作業では、担当者ごとに:

- 自分が元annotatorだったcaseを最初から除外する
- 既にadjudication済みになったcaseをresume packetから除外する
- 他のadjudicatorが進めた後の古いwork responseをstaleとして拒否する
- unrelatedなself-ineligible caseの変更で手元のvisible workまで不用意に失効させない

ためのallocation層が必要。

## Decision

新しい担当者別work packet:

    WorksheetReviewRouteAdjudicationWorkPacketV1

を追加する。

責務は「誰にどのadjudication caseを見せるか」に限定する。

final adjudicationの適用はissue-0170の既存:

    applyWorksheetReviewRouteAdjudicationResponse

を正本として再利用する。

## Eligibility

adjudicatorごとのpacketへ含める条件:

- adjudication未確定
- annotation数 >= WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS
- current adjudicatorRefが既存annotationのannotatorRefに含まれない

したがってself-review対象は**提示前**に除外する。

## Blinding

adjudicatorRefはpacket生成時のfilterにのみ使う。

packetへ含めない:

- adjudicatorRef
- annotatorRef
- annotationReference
- projectionState
- provider/model identity
- provider output
- probability/confidence
- existing adjudication

packetへ含める:

- route definitions
- minimumAnnotationsPerCase
- case id
- evidence
- anonymized annotation route/rationale

issue-0170のblinding境界を維持する。

## Work packet digest

representation:

    worksheet-review-route-adjudication-work-packet-v1

digest input:

- representation version
- labeling protocol version
- minimum annotation count
- route definitions
- **current adjudicatorにvisibleなeligible case集合**
  - case id
  - evidence
  - anonymized annotation route/rationale

adjudicatorRef自体はdigest inputへ入れない。

同じeligible setを見る2人のadjudicatorは同じpacket digestを得られる。

これはidentity leakageを抑え、packetを「visible work state」のidentityとして扱うため。

## Resume semantics

responseはsubset decisionを許可する。

例:

1. packet = case A / B
2. adjudicatorがAだけ完了してresponse apply
3. updated corpusでpacket再生成
4. resume packet = case B

既存issue-0170 applyはpartial decisionsを受理するため、この性質をそのまま利用する。

## Stale response

apply時:

1. response.adjudicatorRefでcurrent work packetを再生成
2. packetDigest一致を確認
3. response decisionがcurrent work case集合のsubsetか確認
4. issue-0170 global adjudication packetをcurrent corpusから生成
5. current global packet digestでcanonical issue-0170 applyへ委譲

visible eligible setが変わっていればstaleとしてrejectする。

## Why global apply remains canonical

work allocation moduleでは以下を再実装しない:

- adjudicationReference生成
- final adjudication object構築
- self-review最終防御
- strict corpus validation
- immutable corpus cloning semantics

work responseを検証後、current global packet digestを使ったcanonical issue-0170 responseへ変換して既存applyを呼ぶ。

## Unrelated hidden changes

current adjudicatorから見えないself-ineligible caseだけが変化しても、visible work packet digestは変えない。

そのため:

- 自分が見ていないcaseのevidence修正
- self-review対象caseの内部変更

だけで、無関係なvisible workを不用意にstale扱いしない。

canonical apply時にはcurrent global packetを生成し直すため、実際に選択したcaseへのstrict validationは維持する。

## Non-goals

- adjudicator ranking
- automatic assignment optimization
- majority vote
- unanimous auto-finalization
- concurrent lock manager
- lease/timeout
- provider invocation
- provider/model scoring
- production routing
- UI implementation
- apply authority
- live Jev call

## Acceptance criteria

- [x] per-adjudicator work packet schema/version/representationを固定
- [x] self-review対象caseを提示前に除外
- [x] 2 annotation未満caseを除外
- [x] adjudicated caseを除外
- [x] adjudicatorRefをpacketへ含めない
- [x] annotator identities / annotationReferenceをpacketへ含めない
- [x] projection/provider/model/probability/confidenceをpacketへ含めない
- [x] shared required annotation countを利用
- [x] same eligibilityのadjudicatorは同じblinded digestを得る
- [x] partial responseを許可
- [x] resume時にremaining caseだけを返す
- [x] stale work responseをreject
- [x] response外case/self-review caseをreject
- [x] unrelated self-ineligible case変更ではvisible packet digestを変えない
- [x] strict response validation
- [x] duplicate decisionをreject
- [x] source corpusをmutateしない
- [x] final applyはissue-0170 canonical pathを再利用
- [x] live provider / production routingを変更しない

## Validation plan

- fresh adjudicator gets all eligible cases
- former annotator sees only non-self cases
- packet non-disclosure
- same eligible set -> same digest across adjudicators
- partial apply
- resume returns remaining work
- self-review smuggling rejection
- stale response after another adjudicator changes eligible set
- hidden self-ineligible case change does not stale unrelated work
- unknown field rejection
- duplicate decision rejection
- input immutability
- strict compile

## Validation policy

GitHub Actionsの既知runner/resource不足は完了条件にしない。

repository dependency treeが無い場合はrepository全test passを主張せず、strict compile / focused harness / source-level contract inspectionを記録する。


## Validation evidence

### 2026-09-21 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0170 adjudication packet/apply contractとissue-0173 annotation work allocationを再読し、責務分離を確認。
- 新しいadjudication work allocation本体をinterface-compatibleなstubsとともに
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **4 checks / 4 pass / 0 fail**。
  - current adjudicatorが元annotatorだったcaseをpacket生成時に除外。
  - partial adjudication後、resume packetはremaining caseだけを返す。
  - 別adjudicatorがvisible caseを先に処理した後、古いwork responseをstaleとしてreject。
  - self-ineligibleでpacketに見えていないcaseだけのevidence変更ではvisible work digestを維持。
- repository test sourceではさらに:
  - fresh adjudicatorへ全eligible caseを提示。
  - same eligibilityの異なるadjudicatorでpacket digest一致。
  - packetからadjudicator/annotator identity、annotationReference、projection/provider/confidenceを非露出。
  - self-review caseをvalid packet responseへ混入してもreject。
  - unknown response field / duplicate decisionをcanonical issue-0170 validator経由でreject。
  - source corpus immutability。
- final adjudication applicationはissue-0170の `applyWorksheetReviewRouteAdjudicationResponse` を再利用し、adjudicationReference生成やstrict corpus validationを二重実装していない。
- main同期時にmodule/test 2ファイルが一度branch treeから脱落したことを差分確認で検出し、元コミット `a1ed0566...` から回収。回収後のcompareで5ファイル差分に復元した。
- live provider / provider score / automatic consensus / production routing / apply authorityは追加していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
