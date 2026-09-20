# Issue: Worksheet review-route evaluation recordとoffline re-evaluationを実装する

## Meta
- Type: Evaluation governance / Reproducibility
- Status: Open
- Priority: High
- Scope: completed run record, identity linkage, record digest, offline ground-truth re-evaluation
- Expected verification level: unit + focused integration
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0172 Done
- Depends on: issue-0174 Done
- Depends on: issue-0176 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0176でprovider inference条件をplanDigestとして事前固定できるが、完了後の:
- plan
- provider outcomes
- evaluation report
を一体の再現可能artifactとして保持するcontractがない。

また、provider-visible projection stateが変わらずhuman ground truthだけ訂正された場合、既存provider responseを再利用してoffline再評価できることをworkflowとして固定したい。

## Decision

`WorksheetReviewRouteEvaluationRecordV1` を追加する。

record:
- schemaVersion
- protocolVersion
- representation
- purpose
- planDigest
- packetDigest
- groundTruthDigest
- plan
- response
- report
- recordDigest

## Identity separation

3つのidentityを混ぜない。

- `planDigest`: issue-0176 inference plan identity。
- `groundTruthDigest`: issue-0172 final label identity。
- `recordDigest`: completed record content identity。

recordDigestはauthentication signatureではない。
record自身を書き換えてdigestも再計算できる主体への暗号学的改ざん防止は目的外。

## Record creation

`createWorksheetReviewRouteEvaluationRecord(plan, completedRun)`:

- plan strict validation。
- completed planned runだけ受理。
- completedRun.planDigest == plan.planDigest。
- plan / response / report packetDigest一致。
- report groundTruthDigestをtop-levelへbinding。
- plan provider / report provider / all response outcome providersを同一provider identityとして確認。
- response outcomeのobservation:
  - id == caseId
  - sourceDigest == caseDigest
  - schemaVersion == evaluation Observation v1
- response case orderをcanonical sorted orderとして要求。
- report evaluatedCaseIds / summary.caseResults idsをresponse case orderへ一致。
- record contentからSHA-256 recordDigest生成。

## Strict record validation

unknown top-level fieldをrejectする。

nested:
- issue-0176 plan validator。
- issue-0172 response validator。
- report schema / metric structure / projection separability structure。
- provider linkage。
- identity linkage。
- recordDigest再計算。

## Offline re-evaluation

`reevaluateWorksheetReviewRouteEvaluationRecord(corpus, record)`:

1. record strict validation。
2. current corpusをrecord.plan.readinessPolicyで再評価。
3. readinessが失われていればreject。
4. stored responseをissue-0172 evaluatorへ再投入。
5. provider-visible packetが変わっていればstaleとしてreject。
6. new reportを生成。
7. same plan / same response / new reportでnew recordを生成。

providerは一切呼ばない。

## Expected behavior

readinessを維持するlabel-only correction:
- planDigest same
- packetDigest same
- response same
- provider calls 0
- groundTruthDigest changes
- recordDigest changes

projection state change:
- issue-0172 stale packetでreject

readiness regression:
- offline re-evaluationをreject

## Acceptance criteria

- [ ] record schema/version/representationを固定。
- [ ] planDigest / packetDigest / groundTruthDigestをtop-levelへ保持。
- [ ] plan / response / reportをrecordへsnapshot。
- [ ] recordDigestをSHA-256で生成。
- [ ] recordDigestはauthenticationではない旨を文書化。
- [ ] issue-0176 plan validatorを再利用。
- [ ] issue-0172 response validatorを再利用。
- [ ] report structureをstrict validation。
- [ ] plan/report/response provider identityを一致確認。
- [ ] outcome observation idをcaseIdへbinding。
- [ ] outcome observation sourceDigestをcaseDigestへbinding。
- [ ] evaluation Observation schemaを確認。
- [ ] response case orderをcanonicalに要求。
- [ ] report evaluatedCaseIdsをresponse idsへ一致。
- [ ] summary caseResults idsをresponse idsへ一致。
- [ ] unknown record fieldをreject。
- [ ] tampered digest/linkageをreject。
- [ ] readiness-preserving label correctionをoffline再評価。
- [ ] label correctionでplan/packet/response不変。
- [ ] label correctionでgroundTruthDigest/recordDigest変化。
- [ ] projection changeをstaleとしてreject。
- [ ] readiness regressionをreject。
- [ ] source corpus / source recordをmutateしない。
- [ ] live provider / persistence / credential / production routingを追加しない。

## Validation plan

- valid completed planned run -> record。
- deterministic recordDigest。
- record non-disclosure。
- unknown/tampered record。
- provider linkage mismatch。
- observation case/digest mismatch。
- case-order mismatch。
- label-only offline re-evaluation。
- projection stale rejection。
- readiness regression rejection。
- input immutability。
- strict compile。
