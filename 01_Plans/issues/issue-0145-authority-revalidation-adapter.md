# Issue: 既存Authority処理からExecutable Proposal Receiptを生成する最小adapterを実装する

## Meta
- Type: Feature / Authority integration experiment
- Status: Open
- Priority: High
- Scope: parser / parameter vocabulary / resolver-containment / source identity / read-only preview -> AuthorityRevalidationReceiptV1
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0143-authority-revalidation-receipt.md, issue-0144-authority-review-overlay.md
- Depends on: issue-0141〜0144 Done
- Parallel exclusion: fill telemetry / external-XLSX fixture / production plugin・extension配線は変更しない

## Execution Plan

### Proposed solution

productionコードを変更せず、既存の決定論的処理をexperimental adapterから再利用して、`scope=executable-proposal` の `AuthorityRevalidationReceiptV1` を生成する。

再利用する既存処理:

- `parseEmbedSyntax`
- `resolveSourcePath` / `PathContainmentError`
- `renderEmbedTable`
- `renderEmbedCard`
- `renderEmbedFrame`
- `shouldRenderAsCardImmediately / AfterLoad`

adapter自身が追加するのは:

- `params.schema.json` の既知vocabularyに対応する小さなdeterministic parameter validator
- resolved source bytesのSHA-256照合
- Cognitive Review Envelope内のapproved Profile参照とPerception provenanceの整合確認
- 上記結果からReceipt checkを組み立てる処理

Workbookは既存read-only load経路から渡された `WorkbookData` を入力とする。今Issueでは `loadWorkbook` やXLSX adapterのproduction配線を変更しない。

### Acceptance criteria

- [ ] `runExecutableProposalAuthorityRevalidation` をpure/deterministic orchestrationとして追加する。
- [ ] parser checkは既存 `parseEmbedSyntax` を実行する。
- [ ] parameter-schema checkはNotation v1既知parameter vocabularyを検証し、未知keyはP5 forward compatibilityに従い許容する。
- [ ] resolver checkは既存 `resolveSourcePath` を実行する。
- [ ] containment checkは `PathContainmentError` を独立したfailureとして記録する。
- [ ] source-existence checkはworkspace boundaryを通過したresolved regular fileだけをpassとする。
- [ ] source-identity checkはresolved source bytesの `sha256:<hex>` とEnvelope source digestを比較する。
- [ ] profile-compatibility checkはEnvelopeのvisible candidate/Profile binding、featureVersion、sourceProfileId、sourceEvidenceを再確認する。
- [ ] preview checkは既存Smart Fallback + card/table rendererをread-onlyに実行する。
- [ ] immediate card modeではWorkbookなしでもpreview可能とする。
- [ ] table / after-load Smart FallbackではWorkbook未供給をfail-closedする。
- [ ] 失敗時もReceipt check集合を欠落させず、`failed` とstable evidence codeを返す。
- [ ] Receiptはissue-0143のbinding関数で `satisfied / blocked` 判定可能である。
- [ ] source digestの意味を「resolved source file bytesのSHA-256」と明示する。
- [ ] production parser/resolver/renderer/plugin/extension/workbook loaderを変更しない。
- [ ] fill telemetry / external-XLSX評価ファイルを変更しない。

### Validation plan

- strict TypeScript compile。
- temporary workspace + real CSV file + in-memory WorkbookDataで成功経路を検証する。
- invalid known parameter、missing source、containment violation、digest mismatch、preview failure、Profile provenance不整合をfail-closedで検証する。
- unknown parameterがforward-compatibleに許容されることを確認する。
- explicit card modeがWorkbookなしでpreviewできることを確認する。
- Receiptをissue-0143 binderへ渡し、成功経路はsatisfied、失敗経路はblockedとなることを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
