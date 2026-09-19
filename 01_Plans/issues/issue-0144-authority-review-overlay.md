# Issue: Authority verification overlayをreview presentationへ統合する

## Meta
- Type: Feature / Review UX contract
- Status: Open
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

- [ ] `AuthorityVerificationOverlayV1` をpure TypeScriptで定義する。
- [ ] overlayは `authority-verification` roleを持ち、Cognitive metricsを含めない。
- [ ] `VerifiedCognitiveReviewSurfaceV1` はbase review presentationとoverlayを別sectionで保持する。
- [ ] Receiptはissue-0143のbinding関数を通してからoverlay化する。
- [ ] presentation / envelope / receiptのsource digest不一致をfail-closedする。
- [ ] satisfied / blocked状態とfailed checksをそのまま保持する。
- [ ] check evidence code / detailを保持する。
- [ ] Authority issuer component/version/run idを保持する。
- [ ] base presentationの `review-only / writeAuthority=none / applyStatus=not-authorized` を変更しない。
- [ ] Judgment proposal / abstentionをAuthority結果で変更しない。
- [ ] overlayにapply/mutation/approval APIを追加しない。
- [ ] base presentationとEnvelopeをmutateしない。
- [ ] raw worksheet cells / feature arrays / cross-provider scoreを追加しない。
- [ ] focused testでsatisfied、blocked、source mismatch、base不変、Judgment不変を確認する。
- [ ] production UI / parser / resolver / matcher / fill telemetryを変更しない。

### Validation plan

- strict TypeScript compile。
- issue-0141〜0143の実経路からEnvelope / Presentation / Receiptを生成してoverlay compositionをfocused testする。
- serialized surfaceにraw cell/features/apply/overallScoreがないことを確認する。
- repository差分で並行fill lane・production UIに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
