# Authority Verification Overlay v1

## 1. 目的

Cognitive Review Presentation（認知結果を人間が確認するための表示契約）は、レビュー用の情報を表す。Authority検証（既存規則による記法や参照元などの検証）が完了しても、認知提案そのものを「承認済み」へ変更しない。

Authority Revalidation Receipt（Authority検証結果の記録）を表示する場合は、base presentation（元のレビュー表示データ）を書き換えず、独立した `AuthorityVerificationOverlayV1`（検証結果を別に重ねる表示情報）として合成する。

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

base review（元の認知レビュー表示）はissue-0142で定めた意味を維持する。

- Cognitive Perceptionは候補
- Cognitive Judgmentはproposal-onlyまたはnon-decision
- write authorityなし
- apply statusはnot-authorized

### Authority overlay

overlay（元の表示とは分けて付け加える情報）だけがdeterministic Authority check（同じ条件であれば同じ結果となるAuthority検証）の結果を表す。

- `satisfied`
- `blocked`
- scope
- Authority issuer
- check status
- evidence code
- failed checks

Authority `satisfied` は、Authority側の検証条件を満たしたという結果であり、Cognitive Judgment（認知側が示した判断案）が正しいことや、人間が承認済みであることを意味しない。

## 3. Source binding

composition（表示用データの合成）の際には、次の3者のsource digest（参照元を識別・照合する値）を一致させる。

- Cognitive Review Envelope
- Cognitive Review Presentation
- Authority Receipt

Receiptは必ず、issue-0143の `bindAuthorityRevalidationReceipt`（EnvelopeとReceiptを照合する処理）を通して検証する。

## 4. Overlay check

各check（検証項目）については、

- check
- status
- evidenceCode
- optional detail

だけを表示用に保持する。

Cognitive score（認知側の評価値）やPerception candidate（認知側で見いだした候補）は、overlayへコピーしない。

## 5. 不変性

compositionは、入力をmutate（元データを書き換えること）しない。

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

実際のVS Code UIは、このsurface contract（合成後の表示データの契約）を利用する別Issueで扱う。
