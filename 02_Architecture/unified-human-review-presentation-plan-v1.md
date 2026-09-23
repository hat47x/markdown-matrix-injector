# Unified Human Review Presentation Plan v1

## 1. 目的

UnifiedHumanReviewViewModelV1 の4 trust domainを混ぜずに、human reviewerへ見せる順序と既定展開状態だけを決める。

    UnifiedHumanReviewViewModelV1
                |
                v
    UnifiedHumanReviewPresentationPlanV1
                |
                v
       future UI implementation

この層はUI-neutralであり、DOM / React / VS Code APIを知らない。

## 2. Source of truth

review内容の正本は引き続き UnifiedHumanReviewViewModelV1。

Presentation Planはsection order / default disclosure / summary metadataだけを派生させる。Authority / Cognitive / Deterministic artifactそのものを再定義しない。

## 3. Fixed ordering

    1 Authority
    2 Cognitive
    3 Deterministic
    4 Proposal Identity

Authorityは実行前提のblocking factを最初に見せる。satisfied はhuman approvalではない。
CognitiveはPerceptionとoptional Judgmentを確認する。
Deterministicはmatcher comparison由来のreview reasonを確認する。
Proposal Identityは常時必要なreview本文ではないためdetails側へ置く。

## 4. Default disclosure

Authority: blockedのみexpanded。
Cognitive: Perceptionがmatched以外、またはJudgmentがnot-requested以外ならexpanded。
Deterministic: reviewRelevantReasonCount > 0のみexpanded。
diagnosticReasonCountはsummaryには出すが、それ単独では展開triggerにしない。
Proposal Identity: 常にcollapsed。

## 5. No cross-section coupling

各sectionは自分自身の状態だけでdefault disclosureを決める。

禁止例:
- Authority blocked -> Cognitiveも展開
- Cognitive novel -> Deterministicも展開
- deterministic reasonあり -> Authority statusを上書き

これによりpresentation layerが暗黙の総合判断器になることを防ぐ。

## 6. Compact summaries

Authority: verificationStatus / failedCheckCount / writeAuthority / applyStatus
Cognitive: classification / candidateCount / hasWinner / judgmentState / optional judgmentStatus
Deterministic: reviewRelevantReasonCount / diagnosticReasonCount
Proposal Identity: algorithm / representation

raw source / notation / cells / features / digest本文はsummaryへ入れない。

## 7. No verdict

schemaにoverallStatus / overallScore / combinedScore / recommendation / accepted / approved / canApplyを追加しない。

UI実装もPresentation Planからそれらを推測するcontractにはしない。

## 8. Validation

inputはunified view model v1 / audience human-review / 4 role一致 / review-only no-write not-authorized / deterministic reason count整合を要求する。

不整合artifactを「表示だけだから」と受理しない。

## 9. Future UI

将来UIへ接続する場合もsection order / summary row / details disclosureをこのplanから読む。

色・アイコン・ラベル文言・キーボード操作・アクセシビリティは別UI contractで扱う。

## 10. 非責務

- approval workflow
- provider routing
- model confidence normalization
- persistence
- source mutation
- rendering technology
- localization copy
