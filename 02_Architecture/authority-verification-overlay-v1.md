# Authority Verification Overlay v1

## 1. 目的

Cognitive Review Presentationは、認知結果を人間がレビューするための表示契約であり、Authority検証が完了しても認知提案そのものを「承認済み」へ変更しない。

Authority Revalidation Receiptを表示する場合は、base presentationを書き換えず、独立した `AuthorityVerificationOverlayV1` として合成する。

```text
CognitiveReviewPresentationV1
  - review-only
  - writeAuthority=none
  - Judgment proposal/non-decision
            +
AuthorityRevalidationReceiptV1
  -> bind against original Envelope
            |
            v
AuthorityVerificationOverlayV1
            |
            v
VerifiedCognitiveReviewSurfaceV1
  review: unchanged cognitive presentation
  authorityVerification: separate authoritative evidence
```

## 2. 意味分離

### Base review

base reviewはissue-0142の意味を維持する。

- Cognitive Perceptionは候補
- Cognitive Judgmentはproposal-onlyまたはnon-decision
- write authorityなし
- apply statusはnot-authorized

### Authority overlay

overlayだけがdeterministic Authority checkの結果を表す。

- `satisfied`
- `blocked`
- scope
- Authority issuer
- check status
- evidence code
- failed checks

Authority `satisfied` は、Cognitive Judgmentが正しいことや、人間承認済みであることを意味しない。

## 3. Source binding

composition時に3者のsource digestを一致させる。

- Cognitive Review Envelope
- Cognitive Review Presentation
- Authority Receipt

Receiptは必ずissue-0143の `bindAuthorityRevalidationReceipt` を通して検証する。

## 4. Overlay check

各checkは:

- check
- status
- evidenceCode
- optional detail

だけを表示用に保持する。

Cognitive scoreやPerception candidateはoverlayへコピーしない。

## 5. 不変性

compositionは入力をmutateしない。

- Envelope Authority requirementsはpendingのまま
- Presentation Authority sectionはreview-only / no-writeのまま
- Judgment proposal/non-decisionは変更しない
- Receiptも変更しない

## 6. 非責務

- apply command
- approval action
- Authority check実行
- Receipt issuer認証
- UI rendering
- provider invocation
- score統合
- production runtime接続

実際のVS Code UIはこのsurface contractを利用する別Issueで扱う。
