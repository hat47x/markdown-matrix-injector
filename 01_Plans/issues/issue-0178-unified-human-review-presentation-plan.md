# Issue: Unified Human Reviewの表示順とprogressive disclosure contractを追加する

## Meta
- Type: Presentation contract / Human review UX boundary
- Status: Done
- Priority: High
- Scope: section ordering, default disclosure, compact summaries
- Expected verification level: unit + focused contract validation
- Production UI: 変更しない

## Traceability
- Depends on: issue-0155 Unified Human Review View Model
- Related: issue-0154 Deterministic Review Evidence Overlay
- Related: issue-0160 Contained Unified Review Workflow
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel work: issue-0177 evaluation record lane
- Parallel exclusion: provider evaluation record / persistence / production UI / Authority semanticsは変更しない

## Problem

issue-0155ではhuman-review向けデータを4領域に分離した。

    Proposal Identity
    Authority
    Cognitive
    Deterministic

しかしview modelは意味分離のcontractであり、実際のreview画面でどのsectionを先に読むか、どのsectionを既定展開するか、diagnostic-onlyな情報をどの程度前景化するかは未定義だった。

各UI実装が独自に順序や展開規則を決めると、同じreview artifactでも重要度の見え方が変わる。

一方でpresentation layerがoverall verdict / combined score / recommendation / automatic approvalを新設すると、issue-0155で意図的に分離した4 trust domainを再び混ぜてしまう。

## Decision

既存 UnifiedHumanReviewViewModelV1 を変更せず、その上に UnifiedHumanReviewPresentationPlanV1 を追加する。

このartifactはsection order / default disclosure / section-local compact summaryだけを持つ。元のreview evidenceやAuthority artifactを複製しない。

## Fixed section order

表示順は固定する。

1. Authority
2. Cognitive
3. Deterministic
4. Proposal Identity

Authorityはblocking factを最初に確認する。ただし satisfied はhuman approvalを意味しない。
CognitiveはPerception / optional Judgmentを表示し、Authority結果へ昇格しない。
Deterministicはfill review reason等の決定論的comparison evidenceを表示し、Cognitive evidenceへ変換しない。
Proposal Identityはintegrity metadataとしてdetails領域へ置き、digest自体を判断根拠として前景化しない。

## Default disclosure rules

### Authority

    blocked   -> expanded
    satisfied -> collapsed

blockedだからCognitive / Deterministicを連動展開しない。

### Cognitive

以下のいずれかならexpanded:
- Perception classification = ambiguous
- Perception classification = novel
- Judgment state = proposal
- Judgment state = non-decision

matched + Judgment not-requestedならcollapsed。

### Deterministic

    reviewRelevantReasonCount > 0 -> expanded
    otherwise                     -> collapsed

diagnostic-only reasonだけでは自動展開しない。

### Proposal Identity

常にcollapsed。

## Section-local summaries

Authority summary:
- verificationStatus
- failedCheckCount
- writeAuthority = none
- applyStatus = not-authorized

Cognitive summary:
- classification
- candidateCount
- hasWinner
- judgmentState
- non-decisionの場合だけjudgmentStatus

Deterministic summary:
- reviewRelevantReasonCount
- diagnosticReasonCount

Proposal Identity summary:
- algorithm
- representation

digest / source path / raw notationはsummaryへ持ち込まない。

## No cross-domain scoring

presentation planはoverallStatus / overallScore / combinedScore / recommendation / accepted / approved / canApply / apply actionを持たない。

section展開規則も各section自身の事実だけから決める。Authority blockedだからDeterministicをexpandedにはしない。Deterministic reasonがあるからCognitiveをexpandedにはしない。

## Non-goals

- React / VS Code UI component
- visual color / typography / icon
- human approval action
- automatic accept / reject
- apply authority
- provider invocation
- source mutation
- evaluation metric
- presentation copy / i18n文言
- persistence

## Acceptance criteria

- [x] UnifiedHumanReviewPresentationPlanV1 を追加
- [x] section orderを Authority / Cognitive / Deterministic / Proposal Identity に固定
- [x] Authority blockedのみAuthorityを既定展開
- [x] matched + Judgment not-requestedではCognitiveを既定折りたたみ
- [x] ambiguous / novelでCognitiveを既定展開
- [x] Judgment proposal / non-decisionでCognitiveを既定展開
- [x] review-relevant deterministic reasonでDeterministicを既定展開
- [x] diagnostic-only reasonだけではDeterministicを既定展開しない
- [x] Proposal Identityを常に既定折りたたみ
- [x] section-local compact summaryを追加
- [x] cross-domain連動を追加しない
- [x] overall verdict / score / recommendationを追加しない
- [x] apply authorityを追加しない
- [x] source view modelをmutateしない
- [x] incompatible schema / role / boundary / reason countをreject
- [x] production UIを変更しない

## Validation plan

- stable matched review -> 4 sectionすべてcollapsed
- blocked Authority -> Authorityのみexpanded
- ambiguous / novel Perception -> Cognitiveのみexpanded
- Judgment proposal / non-decision -> Cognitive expanded
- review-relevant reason -> Deterministic expanded
- diagnostic-only reason -> Deterministic collapsed
- all three notable conditions coexist -> Proposal Identityだけcollapsed
- serializationにoverall verdict / score / apply actionなし
- input immutability
- invalid schema / role / boundary / reason count rejection
- strict compile

## Concurrency

issue-0177 worksheet-review-route-evaluation-record は別branchで進行中。

issue-0178はunified review presentationの新規source/test/docsのみを変更し、0177のevaluation record / report / plan / packetには触れない。

branchは feature/human-review-presentation-ordering-v1 1本に限定し、完了後mainへ戻す。

## Validation policy

GitHub Actionsの既知runner/resource不足は完了条件にしない。

repository dependency treeを利用できない環境ではrepository全test passを主張せず、strict compile / focused contract inspection / diff確認を記録する。


## Validation evidence

### 2026-09-21 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- `UnifiedHumanReviewPresentationPlanV1` 本体を、`UnifiedHumanReviewViewModelV1` の公開interface互換stubと組み合わせ、
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **5 checks / 5 pass / 0 fail**。
  1. satisfied + matched + Judgment not-requested + no reasonsでは4 sectionすべてcollapsed。
  2. Authority blockedではAuthorityだけexpandedし、Cognitive / Deterministicへ連動しない。
  3. Cognitive novelではCognitiveだけexpandedし、Deterministicへ連動しない。
  4. review-relevant deterministic reasonではDeterministicだけexpanded。
  5. diagnostic-only reasonだけではDeterministicをexpandedにしない。
- repository test sourceでは追加で:
  - ambiguous Perception
  - Judgment proposal
  - Judgment non-decision / abstained
  - all notable conditions coexist時もProposal Identityはcollapsed
  - source model immutability
  - invalid schema / role / Authority boundary / reason count rejection
  - serializationにoverall verdict / score / recommendation / apply actionを含めない
  を固定。
- Production UI / provider / Authority / matcher / evaluation metricは変更していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
