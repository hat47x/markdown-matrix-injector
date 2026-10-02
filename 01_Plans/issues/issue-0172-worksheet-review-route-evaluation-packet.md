# Issue: Blinded worksheet review-route evaluation packetとstrict join runnerを実装する

## Meta
- Type: Evaluation infrastructure / Ground-truth binding
- Status: Done
- Priority: High
- Scope: provider-visible evaluation packet, provider outcome response, adjudicated label join, evaluation report
- Expected verification level: unit + focused evaluation
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0167 Done
- Depends on: issue-0168 Done
- Depends on: issue-0170 Done
- Related: issue-0165 Jev Worksheet Review Route
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0170までで、provider outputから独立したfinal inspect/routine labelをhuman adjudicationで確定できるようになった。

次にproviderを評価する際、次の2点を同時に守る必要がある。

1. provider inference時にはfinal expected routeを見せない。
2. provider outcomesとfinal labelsを手作業でjoinしない。

手作業joinには:
- caseの取り違え
- missing caseの黙殺
- extra caseの混入
- stale projection stateに対するoutcomeの再利用
- 別provider runの混在

というリスクがある。

また、label correctionだけでprovider-visible stateが変わっていない場合、provider inferenceを再実行する必要はない。一方で、評価reportがどのfinal labelsを使ったかは明示的に記録する必要がある。

## Decision

provider-facingな `WorksheetReviewRouteEvaluationPacketV1` と、packet-bound outcome response、strict evaluation reportを追加する。

## Provider-visible packet

packetに含める:
- canonical review-route question
  - id
  - semantics
  - inspect/routine choices
- adjudicated case id
- per-case `caseDigest`
- case projection state
  - classification
  - candidateCount
  - hasWinner
  - noveltyScore

packetに含めない:
- expectedRoute
- evidence
- annotations
- adjudication
- annotator/adjudicator identity
- rationale
- provider/model identity
- provider probability/confidence

つまりprovider inputはissue-0165で定義したreview-route stateだけ。

## Packet eligibility

packetはissue-0168 corpusのうち**adjudicated + projectionStateあり**のcaseだけを使う。

既存 `getAdjudicatedWorksheetReviewRouteProjectionCases` を利用する。

adjudicated caseにprojectionStateがなければ既存getterがfail-closedする。

packet対象が0件の場合もrejectする。

## Packet digest

representation:

    worksheet-review-route-evaluation-packet-v1

SHA-256 input:
- representation
- labeling protocol version
- canonical question id / semantics / choices
- sorted case id + projection state

case orderだけの変更ではdigestを変えない。

projection stateが変わればdigestを変える。

**final expected routeはdigest inputに入れない。**

理由は次のとおりです。
provider-visible stateが同じなら、ground-truth correctionだけのためにprovider inferenceを再実行しないため。

## Evaluation response

response:
- schemaVersion
- labeling protocolVersion
- packetDigest
- outcomes
  - caseId
  - caseDigest
  - ClosedChoice Judgment outcome

strict validation:
- unknown top-level field reject
- duplicate caseId reject
- caseDigest format check
- malformed Cognitive Outcome reject
- packet digest format check
- protocol version check

## Strict case join

evaluation時:
1. current corpusからpacketを再生成
2. response.packetDigestと比較
3. response case setとpacket case setを完全一致させる
4. caseDigestをpacketのprovider-visible stateへ照合
5. current adjudicated labelsをcase idでjoin
6. issue-0167 evaluatorへ渡す

missing outcomeもextra outcomeもrejectする。

部分評価を暗黙に許可しない。

部分評価が必要なら将来別contractで明示する。

## Per-case state binding

packet全体のpacketDigestに加えて、各caseへ `caseDigest` を付ける。

representation:

    worksheet-review-route-evaluation-case-v1

caseDigest input:
- representation
- labeling protocol
- canonical question id
- case id
- projection state

response recordにもcaseDigestを要求し、packet内の同case digestと完全一致させる。

目的は、outcome収集時のcaseId付け替え・別stateへの誤joinを早期検出すること。

caseDigestはprovider署名ではなくworkflow integrity bindingであり、悪意あるresponseの暗号学的証明を目的としない。

## Provider consistency

1 reportは1 provider descriptorだけを評価する。

全outcomeで:
- provider id
- version
- category
- executionBoundary
- capabilities

が同一であることを要求する。

異なるprovider/model runを1 summaryへ混ぜない。

## Canonical question binding

signal outcomeはcanonical:

    worksheet-format-review-route-v1

question idであることを要求する。

issue-0167 evaluator自体は一般的なclosed-choice outcomeを評価できるが、issue-0172 runnerではreview-route専用評価としてquestion identityを追加検証する。

non-decision outcomeはsignal payloadを持たないためquestion-id check対象外。

## Ground-truth digest

reportにはpacketDigestと別に `groundTruthDigest` を持つ。

representation:

    worksheet-review-route-ground-truth-v1

digest input:
- representation
- labeling protocol version
- packetDigest
- sorted caseId + final expected route

性質は次のとおりです。
- projection state変更 -> packetDigest変更
- final routeだけ変更 -> packetDigest不変
- final routeだけ変更 -> groundTruthDigest変更

これによりは次のとおりです。
- provider inference input version
- evaluation label version

を分離して追跡できる。

groundTruthDigestは**route label集合のidentity**であり、adjudicatorRef/rationale/adjudicationReferenceまでのprovenance hashではない。それらの監査正本はlabel corpus側に残す。

## Report

`WorksheetReviewRouteEvaluationReportV1`:
- schemaVersion
- protocolVersion
- purpose
- packetDigest
- groundTruthDigest
- provider descriptor
- evaluatedCaseIds
- issue-0167 summary
- issue-0167 projection separability

新しい評価式は作らない。

issue-0167のmetric semanticsをそのまま再利用する。

## No provider execution

本Issueはproviderを呼ばない。

packetはprovider-facing evaluation input contractを表すが:
- live Jev call
- transport selection
- model selection
- retries
- concurrency
- persistence

は実装しない。

provider executionはissue-0161/0162/0165/0166側の責務。

## Non-goals

- live provider invocation
- model comparison automation
- production routing
- threshold tuning
- automatic fallback policy
- label generation
- adjudication
- provider outputをground truthへ反映
- partial evaluation semantics
- apply authority
- UI実装

## Acceptance criteria

- [x] evaluation packet schema/version/representationを固定
- [x] packetはadjudicated + projectionState caseだけを使用
- [x] zero eligible caseをreject
- [x] packetへexpectedRouteを含めない
- [x] packetへevidence/annotation/adjudicationを含めない
- [x] packetへprovider/model/confidence/probabilityを含めない
- [x] canonical review-route questionをpacketへ保持
- [x] packet digestをSHA-256で生成
- [x] case order変更ではdigest不変
- [x] projection state変更でdigest変化
- [x] final route変更ではpacket digest不変
- [x] response protocolVersionを固定
- [x] response strict validation
- [x] per-case caseDigestを固定
- [x] response caseDigest mismatchをreject
- [x] duplicate outcome case reject
- [x] stale packet response reject
- [x] missing outcome reject
- [x] extra outcome reject
- [x] mixed provider descriptor reject
- [x] wrong question id signal reject
- [x] final labelsをstrict case join
- [x] groundTruthDigestを別途生成
- [x] final route変更でgroundTruthDigest変化
- [x] issue-0167 summaryを再利用
- [x] issue-0167 projection separabilityを再利用
- [x] corpus/responseをmutateしない
- [x] live provider / production runtimeを変更しない

## Validation plan

- packet non-disclosure
- canonical question
- packet case-order invariance
- projection state digest change
- label-only correction packet invariance
- label-only correction groundTruth digest change
- valid strict join
- known metric values
- projection separability
- missing/extra/duplicate outcomes
- caseDigest mismatch
- stale packet
- mixed provider
- wrong question
- input immutability
- strict compile

## Validation policy

GitHub Actionsの既知runner/resource不足は完了条件にしない。

repository dependency treeが無い場合はrepository全test passを主張せず、strict compile / focused harness / source-level contract inspectionを記録する。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- repository checkout/authはcontainer側に無く、private GitHubへshellから直接cloneできないため、公開interface互換のfocused TypeScript harnessで
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  のcompileを実行し成功。
- focused runtime harness: **10 checks / 10 pass / 0 fail**。
  - packetDigestがSHA-256形式。
  - per-case caseDigestがSHA-256形式。
  - corpus case order変更でpacketDigest不変。
  - projection state変更でpacketDigest変化。
  - final route変更だけではpacketDigest不変。
  - final route変更でgroundTruthDigest変化。
  - caseDigest mismatchをreject。
  - missing case coverageをreject。
  - mixed provider descriptorをreject。
  - wrong canonical questionをreject。
- repository test sourceではさらに:
  - provider packetがexpectedRoute / evidence / annotations / adjudication / label provenanceを保持しない。
  - zero adjudicated projection caseをreject。
  - response unknown field / protocol mismatchをreject。
  - projection state変更後のstale packet responseをreject。
  - missing / extra / duplicate outcome caseをreject。
  - exact issue-0167 metricsを再利用。
  - projection separabilityをreportへ保持。
  - corpus / response immutability。
- provider packetとground truthを別digestへbindingし、label correctionだけでprovider inference input identityを変えないことを固定。
- per-case caseDigestはaccidental outcome misbinding防止用のworkflow integrity bindingであり、provider署名や悪意あるresponseに対する暗号学的証明とは扱わない。
- live Jev call / model selection / threshold / production routing / apply authorityは追加していない。
- repository dependency treeは現環境に無いためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。


## Concurrency reconciliation

2026-09-20、並行レーン統合後に `worksheet-review-route-readiness` と本Issueがともに `issue-0171` を使用していることを検出した。

時系列ではreadiness側の0171作業が先行していたため:
- readiness = issue-0171を維持。
- 本evaluation packet = issue-0172へ改番。
- 実装module / architecture file名 / schema versionは意味変更がないため変更しない。
- provider-visible packet / caseDigest / groundTruthDigestの契約にも変更なし。

この改番は追跡番号の衝突解消のみで、runtime semanticsは変更しない。
