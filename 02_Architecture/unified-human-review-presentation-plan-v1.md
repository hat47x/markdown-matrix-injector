# Unified Human Review Presentation Plan v1

## 1. 目的

UnifiedHumanReviewViewModelV1にある4つのtrust domain（信頼の境界を分けた領域）を混ぜず、人によるreview（確認）の際に表示する順序と、詳細を既定で展開するかどうかだけを定める。

    UnifiedHumanReviewViewModelV1
                |
                v
    UnifiedHumanReviewPresentationPlanV1
                |
                v
       future UI implementation

この層はUI-neutral（表示技術に依存しない）であり、DOM / React / VS Code APIには依存しない。

## 2. Source of truth

review内容の正本は、引き続きUnifiedHumanReviewViewModelV1とする。

Presentation Plan（表示計画）はsection order（表示順序）/ default disclosure（詳細の既定展開状態）/ summary metadata（要約用の付随情報）だけを派生させる。Authority / Cognitive / Deterministic artifact自体の意味は再定義しない。

## 3. Fixed ordering

    1 Authority
    2 Cognitive
    3 Deterministic
    4 Proposal Identity

Authorityでは、実行を妨げるblocking fact（前提条件を満たさない事実）を最初に示す。satisfiedはhuman approval（人による承認）を意味しない。
CognitiveではPerception（観測・認識結果）とoptional Judgment（任意の判断結果）を確認する。
Deterministicではmatcher comparison（照合結果の比較）に由来するreview reason（確認理由）を確認する。
Proposal Identityはreviewのたびに本文へ表示する必要がないため、details（詳細表示）側に置く。

## 4. Default disclosure

Authority: blockedの場合だけexpanded（詳細を展開）とする。
Cognitive: Perceptionがmatched以外、またはJudgmentがnot-requested以外の場合にexpandedとする。
Deterministic: reviewRelevantReasonCount > 0の場合だけexpandedとする。
diagnosticReasonCountはsummary（要約）に表示するが、その値だけを展開trigger（きっかけ）にはしない。
Proposal Identity: 常にcollapsed（詳細を閉じた状態）とする。

## 5. No cross-section coupling

各section（表示区画）のdefault disclosureは、そのsection自身の状態だけで決める。

禁止するsection間の連動例は次のとおり。
- Authority blocked -> Cognitiveも展開
- Cognitive novel -> Deterministicも展開
- deterministic reasonあり -> Authority statusを上書き

これにより、presentation layer（表示のための層）が、複数の領域を暗黙に統合して判断する仕組みになることを防ぐ。

## 6. Compact summaries

Authority: verificationStatus / failedCheckCount / writeAuthority / applyStatus
Cognitive: classification / candidateCount / hasWinner / judgmentState / optional judgmentStatus
Deterministic: reviewRelevantReasonCount / diagnosticReasonCount
Proposal Identity: algorithm / representation

raw source / notation / cells / features / digestの本文は、summaryには含めない。

## 7. No verdict

schema（データ形式の定義）には、overallStatus / overallScore / combinedScore / recommendation / accepted / approved / canApplyを追加しない。

UI実装においても、Presentation Planからそれらを推測するcontract（取り決め）は設けない。

## 8. Validation

input（入力）には、unified view model v1 / audience human-review / 4 role一致 / review-only no-write not-authorized / deterministic reason count整合を要求する。

不整合のあるartifact（成果物）は、表示専用であっても受理しない。

## 9. Future UI

将来UIへ接続する場合も、section order / summary row / details disclosureはこのplan（表示計画）から取得する。

色、アイコン、ラベル文言、キーボード操作、アクセシビリティは別のUI contractで扱う。

## 10. 非責務

- approval workflow
- provider routing
- model confidence normalization
- persistence
- source mutation
- rendering technology
- localization copy
