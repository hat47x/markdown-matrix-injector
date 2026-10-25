# Issue: 既存Authority処理からExecutable Proposal Receiptを生成する最小adapterを実装する

## Meta
- Type: Feature / Authority integration experiment
- Status: Done
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

再利用する既存処理は次のとおりです。

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

- [x] `runExecutableProposalAuthorityRevalidation` をpure/deterministic orchestrationとして追加する。
- [x] parser checkは既存 `parseEmbedSyntax` を実行する。
- [x] parameter-schema checkはNotation v1既知parameter vocabularyを検証し、未知keyはP5 forward compatibilityに従い許容する。
- [x] resolver checkは既存 `resolveSourcePath` を実行する。
- [x] containment checkは `PathContainmentError` を独立したfailureとして記録する。
- [x] source-existence checkはworkspace boundaryを通過したresolved regular fileだけをpassとする。
- [x] source-identity checkはresolved source bytesの `sha256:<hex>` とEnvelope source digestを比較する。
- [x] profile-compatibility checkはEnvelopeのvisible candidate/Profile binding、featureVersion、sourceProfileId、sourceEvidenceを再確認する。
- [x] preview checkは既存Smart Fallback + card/table rendererをread-onlyに実行する。
- [x] immediate card modeではWorkbookなしでもpreview可能とする。
- [x] table / after-load Smart FallbackではWorkbook未供給をfail-closedする。
- [x] 失敗時もReceipt check集合を欠落させず、`failed` とstable evidence codeを返す。
- [x] Receiptはissue-0143のbinding関数で `satisfied / blocked` 判定可能である。
- [x] source digestの意味を「resolved source file bytesのSHA-256」と明示する。
- [x] production parser/resolver/renderer/plugin/extension/workbook loaderを変更しない。
- [x] fill telemetry / external-XLSX評価ファイルを変更しない。

### Validation plan

- strict TypeScript compile。
- temporary workspace + real CSV file + in-memory WorkbookDataで成功経路を検証する。
- invalid known parameter、missing source、containment violation、digest mismatch、preview failure、Profile provenance不整合をfail-closedで検証する。
- unknown parameterがforward-compatibleに許容されることを確認する。
- explicit card modeがWorkbookなしでpreviewできることを確認する。
- Receiptをissue-0143 binderへ渡し、成功経路はsatisfied、失敗経路はblockedとなることを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- adapter sourceのstrict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- production module contractと同じimport境界を再構成したfocused runtime harness: **10 checks / 10 pass / 0 fail**。
- GitHub上の正本実装と以下の呼び出し形状を再照合:
  - `parseEmbedSyntax`
  - `resolveSourcePath / PathContainmentError`
  - Smart Fallback
  - card/table/frame renderer
- 検証内容は次のとおりです。
  - 正常なtable proposalで8 Authority checksすべてpass。
  - invalid known parameterをparameter-schema failureへ変換。
  - unknown / `x-*` parameterをP5 forward compatibilityとして許容。
  - missing sourceでresolver / containment / existence / identity / previewをfail-closed。
  - workspace外sourceをcontainment failureとして独立記録。
  - source bytes変更によるSHA-256 mismatchを検出。
  - missing sheetでread-only preview failure。
  - explicit card modeはWorkbookDataなしでpreview成功。
  - Profile provenance改変をprofile-compatibility failureとして検出。
  - resolved pathがdirectoryの場合、regular-file failureとdigest read failureをReceipt内へ保持し、例外でReceipt生成を中断しない。
- 静的確認時に、digest読取失敗がReceipt外例外へ漏れる経路を発見し、`SOURCE_DIGEST_READ_FAILED`へfail-closedするよう修正済み。
- branch上のfocused test sourceは上記ケースをrepositoryの実module経路で実行する形で追加。
- production parser / resolver / renderer / plugin / extension / workbook loaderは変更していない。
- fill telemetry / external-XLSX fixture・評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
