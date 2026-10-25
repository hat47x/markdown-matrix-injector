# Issue: Authority verification overlayをreview presentationへ統合する

## Meta
- Type: Feature / Review UX contract
- Status: Done
- Priority: High
- Scope: Authority verification overlay, cognitive presentation composition, receipt-to-review projection, focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0142-cognitive-review-presentation.md, issue-0143-authority-revalidation-receipt.md
- Depends on: issue-0142 Done, issue-0143 Done
- Parallel exclusion: fill telemetry / external-XLSX / production VS Code UIには触れない

## Execution Plan

### Proposed solution

`CognitiveReviewPresentationV1` 自体はreview-only / Authority pendingのまま維持する。

Authority Receiptが得られた場合は、base presentationを変更せず、別の `AuthorityVerificationOverlayV1` として:

- satisfied / blocked
- Receipt scope
- Authority issuer
- checkごとのstatus / evidence code
- failed checks

を表示用に投影する。

さらに `VerifiedCognitiveReviewSurfaceV1` を、base presentation + Authority overlayのcompositionとして定義する。

このcompositionもapply権限を持たず、AuthorityがsatisfiedでもCognitive Judgmentを「承認済み」に書き換えない。

### Acceptance criteria

- [x] `AuthorityVerificationOverlayV1` をpure TypeScriptで定義する。
- [x] overlayは `authority-verification` roleを持ち、Cognitive metricsを含めない。
- [x] `VerifiedCognitiveReviewSurfaceV1` はbase review presentationとoverlayを別sectionで保持する。
- [x] Receiptはissue-0143のbinding関数を通してからoverlay化する。
- [x] presentation / envelope / receiptのsource digest不一致をfail-closedする。
- [x] satisfied / blocked状態とfailed checksをそのまま保持する。
- [x] check evidence code / detailを保持する。
- [x] Authority issuer component/version/run idを保持する。
- [x] base presentationの `review-only / writeAuthority=none / applyStatus=not-authorized` を変更しない。
- [x] Judgment proposal / abstentionをAuthority結果で変更しない。
- [x] overlayにapply/mutation/approval APIを追加しない。
- [x] base presentationとEnvelopeをmutateしない。
- [x] raw worksheet cells / feature arrays / cross-provider scoreを追加しない。
- [x] focused testでsatisfied、blocked、source mismatch、base不変、Judgment不変を確認する。
- [x] production UI / parser / resolver / matcher / fill telemetryを変更しない。

### Validation plan

- strict TypeScript compile。
- issue-0141〜0143の実経路からEnvelope / Presentation / Receiptを生成してoverlay compositionをfocused testする。
- serialized surfaceにraw cell/features/apply/overallScoreがないことを確認する。
- repository差分で並行fill lane・production UIに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused integration test: **8 tests / 8 pass / 0 fail**。
- issue-0141〜0143の実経路でEnvelope / Presentation / Receiptを生成し、Authority overlay compositionを検証。
- 確認内容は次のとおりです。
  - satisfied Authority verificationをbase Cognitive Reviewとは別sectionで表示。
  - blocked時にfailed checksとevidence detailを保持。
  - Authority issuer component/version/run idとevidence codeを保持。
  - overlayへCognitive confidence / noveltyScore / overallScoreを混入しない。
  - Receipt source mismatchをissue-0143 binding境界で拒否。
  - Presentation source digest改変を拒否。
  - PresentationがAuthority requirementをcompletedと偽装する改変を拒否。
  - surface serializationにraw `cells / features`、apply API、combined/overall scoreを追加しない。
  - AuthorityがsatisfiedでもCognitive reviewへapproved/accepted/auto-apply状態を生成しない。
  - composition前後でEnvelope / base Presentationは不変。
- production UI / parser / resolver / matcher / worksheet-format-v6 / fill telemetry / external XLSX fixtureは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
