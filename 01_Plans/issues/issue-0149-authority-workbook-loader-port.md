# Issue: Authority adapterを既存read-only Workbook loaderへ薄く配線する

## Meta
- Type: Feature / Authority wiring
- Status: Open
- Priority: High
- Scope: Workbook loader port, production loader bridge, source snapshot consistency, focused tests
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0145-authority-revalidation-adapter.md, issue-0147-executable-proposal-authority-evidence.md
- Depends on: issue-0145 Done, issue-0147 Done
- Parallel exclusion: fill telemetry / external-XLSX評価ロジック / production loader本体は変更しない

## Problem

issue-0145ではWorkbookDataを呼出側から渡すことで、production `loadWorkbook` の配線変更を避けた。

この境界は安全だが、preloaded WorkbookDataが実際にresolved sourceから読まれたものかをadapter自身では証明できない。

また、source digest確認後〜Workbook load/previewの間にsource fileが変更された場合、検証したsource identityとpreview内容がずれる余地がある。

## Execution Plan

### Proposed solution

1. issue-0145 inputへ `workbookLoader?: (absolutePath) => WorkbookData` portを追加。
2. loaderは**既存resolve/containment成功後のabsolutePathだけ**を受け取る。
3. `workbook` と `workbookLoader` の同時指定を拒否。
4. loader経路ではsource SHA-256をload前後に比較。
5. load中にsource digestが変化した場合、`source-identity` を `SOURCE_CHANGED_DURING_PREVIEW` でfailedへ上書き。
6. loader例外はReceipt外へ漏らさず `PREVIEW_WORKBOOK_LOAD_FAILED` とする。
7. 新規workflow moduleから既存 `loadWorkbook({ absolutePath })` をdynamic importで接続する。
8. production `workbookLoader.ts` 自体は変更しない。

### Acceptance criteria

- [ ] `AuthorityWorkbookLoader` portを追加する。
- [ ] preloaded `workbook` と `workbookLoader` の同時指定をfail-fastする。
- [ ] loaderはcontained resolved pathが得られた場合だけ呼ばれる。
- [ ] parse / resolve / containment失敗時にloaderを呼ばない。
- [ ] explicit `mode=card` はloaderを呼ばない。
- [ ] loader例外を `PREVIEW_WORKBOOK_LOAD_FAILED` としてReceiptに保持する。
- [ ] loader成功時は既存Smart Fallback / rendererへWorkbookDataを渡す。
- [ ] loader呼出前後のsource digestが変化した場合 `SOURCE_CHANGED_DURING_PREVIEW` とする。
- [ ] sourceが不変なら既存 `SOURCE_DIGEST_MATCHED` を維持する。
- [ ] `runExecutableProposalAuthorityEvidenceWithLoader` を追加する。
- [ ] `runExecutableProposalAuthorityEvidenceWithDefaultLoader` から既存production `loadWorkbook` を呼ぶ。
- [ ] production `workbookLoader.ts` / parser / resolver / rendererを変更しない。
- [ ] fill telemetry / external-XLSX評価ファイルを変更しない。

### Validation plan

- injected loaderでresolved absolutePathを受け取ることを確認。
- missing/containment failure/explicit cardでloader未呼出を確認。
- loader例外をblocked Receiptへ変換。
- loaderがsourceを書き換えるfixtureでTOCTOU検出。
- 正常loaderでEvidence/Receipt bindingがsatisfied。
- normal dependency環境向けにproduction default loader + CSVのfocused testを追加。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
