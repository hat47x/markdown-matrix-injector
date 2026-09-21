# Issue: Worksheet review-route evaluation recordとoffline re-evaluationを実装する

## Meta
- Type: Evaluation governance / Reproducibility
- Status: Done
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
- provider-visible evaluation packet
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

`createWorksheetReviewRouteEvaluationRecord(corpus, plan, completedRun)`:

- plan strict validation。
- completed planned runだけ受理。
- completedRun.planDigest == plan.planDigest。
- current corpusからprovider-visible packetを再生成し、plan / packet / response / report packetDigest一致。
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

- [x] record schema/version/representationを固定。
- [x] planDigest / packetDigest / groundTruthDigestをtop-levelへ保持。
- [x] plan / response / reportをrecordへsnapshot。
- [x] recordDigestをSHA-256で生成。
- [x] recordDigestはauthenticationではない旨を文書化。
- [x] issue-0176 plan validatorを再利用。
- [x] issue-0172 response validatorを再利用。
- [x] report structureをstrict validation。
- [x] plan/report/response provider identityを一致確認。
- [x] outcome observation idをcaseIdへbinding。
- [x] outcome observation sourceDigestをcaseDigestへbinding。
- [x] stored packet stateとresponse caseDigestを一致確認。
- [x] report metric tamperをcanonical recomputationでreject。
- [x] evaluation Observation schemaを確認。
- [x] response case orderをcanonicalに要求。
- [x] report evaluatedCaseIdsをresponse idsへ一致。
- [x] summary caseResults idsをresponse idsへ一致。
- [x] unknown record fieldをreject。
- [x] tampered digest/linkageをreject。
- [x] readiness-preserving label correctionをoffline再評価。
- [x] label correctionでplan/packet/response不変。
- [x] label correctionでgroundTruthDigest/recordDigest変化。
- [x] projection changeをstaleとしてreject。
- [x] readiness regressionをreject。
- [x] source corpus / source recordをmutateしない。
- [x] live provider / persistence / credential / production routingを追加しない。

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


## Validation evidence

### 2026-09-21 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- `worksheetReviewRouteEvaluationRecord.ts` を、issue-0167/0171/0172/0176の公開interface互換stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- issue-0172へ追加した `assertWorksheetReviewRouteEvaluationPacket` もstrict compile成功。
- packet validator focused runtime:
  - valid canonical packetを受理。
  - provider-visible state改ざんをcaseDigest再計算でreject。
  - case order変更をreject。
  - unknown question fieldをreject。
  - packetDigest改ざんをreject。
- evaluation record focused runtime:
  - valid completed planned runからdeterministic recordを生成。
  - stored packet / response / report / planのdigest/provider/case linkageを確認。
  - recordDigestだけ再計算しても、report metric改ざんをcanonical summary recomputationでreject。
  - expected route改ざんをgroundTruthDigest再計算でreject。
  - projection separability改ざんをstored packet + labelsからの再計算でreject。
  - readinessを維持するlabel-only correctionではproviderを再実行せずoffline re-evaluation。
  - label correction後もplanDigest / packetDigest / stored responseは不変。
  - groundTruthDigest / metrics / recordDigestは更新。
  - projection state変更はstale packetとしてreject。
  - readiness regressionはprovider再利用前にreject。
  - source corpus / source record / plan / responseをmutateしない。
- repository test source:
  - evaluation packet strict validatorの直接fixtureを追加。
  - evaluation recordのstored packet binding、semantic tamper、case order、offline re-evaluation、stale/readiness境界を直接テスト。
- recordはraw evidence / annotations / annotatorRef / adjudicatorRefを新規保存しない。
- `recordDigest` はcontent identityであり、authentication signature / trusted timestampではない。
- live provider / credentials / persistence / production routing / apply authorityは追加していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。

## Parallel-lane reconciliation

- 作業中にissue-0178 unified human review presentation planがmainへ統合された。
- issue-0178はREADME + presentation-plan filesのみで、0177 implementation/testとは非重複。
- 0177 branchのREADMEは最新main版を基準に再構成し、issue-0178記述を保持したまま0177節だけを追加した。
- 新しいrebase用branchは作らず、元の `feature/worksheet-review-route-evaluation-record` を継続使用する。
