# Issue: Worksheet review-route evaluation plan manifestを実装する

## Meta
- Type: Evaluation governance / Reproducibility
- Status: Done
- Priority: High
- Scope: predeclared policy/provider/packet identity, plan digest, stale-plan/provider mismatch gate
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0171 Done
- Depends on: issue-0172 Done
- Depends on: issue-0174 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0174でreadinessを通過したcorpusだけprovider評価できるようになったが、callerが毎回:
- readiness policy
- provider/model descriptor
をその場で渡せる。

評価結果を見た後でpolicyやprovider versionを変更すると、run同士を同一条件として扱えない。

一方で、final expected routeはprovider-visible inputではない。
human adjudicationのlabel correctionだけでprovider inferenceを再実行する必要はない。

## Decision

実行前条件を固定する `WorksheetReviewRouteEvaluationPlanV1` を追加する。

plan:
- schemaVersion
- protocolVersion
- representation
- purpose
- packetDigest
- readinessPolicy
- provider descriptor
- planDigest

## Plan creation

plan作成時:
1. label corpus validate。
2. explicit readiness policy validate。
3. `requireProjectionForAllAdjudicated=true` を要求。
4. readinessがreadyであることを要求。
5. provider descriptor validate。
6. provider category = judgment / capability includes closed-choiceを要求。
7. issue-0172 evaluation packetを生成。
8. packetDigest / policy / provider identityをSHA-256 planDigestへbinding。

## Ground-truth separation

planDigestにはfinal expected routeを入れない。

理由は次のとおりです。
- issue-0172 packetDigestもprovider-visible projection stateだけにbindしている。
- label correctionだけでprovider inference identityを変えない。
- report側のgroundTruthDigestでlabel versionは別管理できる。

したがっては次のとおりです。
- projection state change -> packetDigest / planDigest change。
- readiness policy change -> planDigest change。
- provider id/version/boundary/capabilities change -> planDigest change。
- final route correction only（readiness policyを引き続き満たす場合） -> packetDigest / planDigest unchanged。
- final route correction only -> report groundTruthDigest changes。

## Planned execution

`runWorksheetReviewRouteEvaluationPlan`:
1. plan strict validation。
2. runtime provider descriptorをplanと完全一致確認。
3. current corpus readinessをplan policyで再評価。
4. not readyならprovider call 0のblocked result。
5. readyならcurrent evaluation packet digestをplan.packetDigestと比較。
6. mismatchならprovider call前にstale plan reject。
7. issue-0174 runnerを実行。
8. resultにplanDigestを付与。

## Provider descriptor canonicalization

capabilities orderは意味を持たないためsorted canonical setとしてplanへ保存する。

plan identity:
- id
- version
- category
- executionBoundary
- sorted capabilities

## Acceptance criteria

- [x] plan schema/version/representationを固定。
- [x] explicit readiness policyをplanへsnapshot。
- [x] provider descriptorをplanへsnapshot。
- [x] provider capabilitiesをcanonical sort。
- [x] plan作成時にreadiness readyを要求。
- [x] projection completeness requirementを要求。
- [x] judgment + closed-choice providerだけを許可。
- [x] packetDigestをplanへbinding。
- [x] planDigestをSHA-256で生成。
- [x] policy changeでplanDigest変化。
- [x] provider version changeでplanDigest変化。
- [x] projection state changeでplanDigest変化。
- [x] readinessを維持するlabel-only correctionでplanDigest不変。
- [x] plan strict validation。
- [x] unknown plan fieldをreject。
- [x] tampered planDigestをreject。
- [x] runtime provider mismatchをprovider call前にreject。
- [x] current packet mismatchをprovider call前にreject。
- [x] current readiness blockedならprovider call 0。
- [x] planned completed resultにplanDigestを保持。
- [x] external provider opt-in境界はissue-0174を再利用。
- [x] corpus/plan/provider descriptorをmutateしない。
- [x] live provider / persistence / deployment判断を追加しない。

## Validation plan

- deterministic plan creation。
- capability order canonicalization。
- policy/provider/projection digest changes。
- label-only correction invariance。
- unknown/tampered plan rejection。
- runtime provider mismatch。
- stale projection packet。
- readiness regression -> blocked。
- completed local run。
- immutability。
- strict compile。


## Validation evidence

### 2026-09-21 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上の `worksheetReviewRouteEvaluationPlan.ts` を、0174の実装module群と公開interface互換stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime: **6 groups pass / 0 fail**。
  1. provider capabilities順序をcanonical sortし、同じdescriptor集合なら同じplanDigest。
  2. readiness policy / provider version / projection state変更でplanDigest変化。readinessを維持するlabel-only correctionではplanDigest不変。
  3. unknown plan field / tampered planDigest / noncanonical provider capability orderをreject。
  4. runtime provider mismatchとstale projection packetをprovider call前にreject。
  5. readiness regressionではprovider call 0のblocked result、readyなplanではcompleted result + planDigest。
  6. corpus / readiness policy / provider descriptorをmutateしない。
- 検証中に2点を修正は次のとおりです。
  - label-only correction fixtureが唯一のinspect classを消してreadiness自体を破っていたため、4-case fixtureへ拡張し「readinessを維持するlabel correction」を検証。
  - canonical capability order検証が比較時にもsortしており順序違反を見逃す問題を修正し、保存順そのものをstrict比較するよう変更。
- planDigestはprovider-visible inference plan identityであり、final label identityは引き続きissue-0172のgroundTruthDigestへ分離。
- live provider / credentials / persistence / retry / model ranking / deployment判断は追加していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。


## Concurrency reconciliation

2026-09-21、並行レーンが先に `issue-0175-worksheet-review-route-adjudication-work-allocation` をmainへ統合したことを検出した。

時系列と採番衝突を解消するため、本evaluation planは **issue-0176** へ繰り下げた。
runtime schema / representation / planDigest semanticsに変更はない。
