# Issue: Authority adapterを既存read-only Workbook loaderへ薄く配線する

## Meta
- Type: Feature / Authority wiring
- Status: Done
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

- [x] `AuthorityWorkbookLoader` portを追加する。
- [x] preloaded `workbook` と `workbookLoader` の同時指定をfail-fastする。
- [x] loaderはcontained resolved pathが得られた場合だけ呼ばれる。
- [x] parse / resolve / containment失敗時にloaderを呼ばない。
- [x] explicit `mode=card` はloaderを呼ばない。
- [x] loader例外を `PREVIEW_WORKBOOK_LOAD_FAILED` としてReceiptに保持する。
- [x] loader成功時は既存Smart Fallback / rendererへWorkbookDataを渡す。
- [x] loader呼出前後のsource digestが変化した場合 `SOURCE_CHANGED_DURING_PREVIEW` とする。
- [x] sourceが不変なら既存 `SOURCE_DIGEST_MATCHED` を維持する。
- [x] `runExecutableProposalAuthorityEvidenceWithLoader` を追加する。
- [x] `runExecutableProposalAuthorityEvidenceWithDefaultLoader` から既存production `loadWorkbook` を呼ぶ。
- [x] production `workbookLoader.ts` / parser / resolver / rendererを変更しない。
- [x] fill telemetry / external-XLSX評価ファイルを変更しない。

### Validation plan

- injected loaderでresolved absolutePathを受け取ることを確認。
- missing/containment failure/explicit cardでloader未呼出を確認。
- loader例外をblocked Receiptへ変換。
- loaderがsourceを書き換えるfixtureでTOCTOU検出。
- 正常loaderでEvidence/Receipt bindingがsatisfied。
- normal dependency環境向けにproduction default loader + CSVのfocused testを追加。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0145〜0149のadapter/workflow compositionをstrict compile:
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused runtime harness: **7 checks / 7 pass / 0 fail**。
- 検証内容:
  - injected loaderへworkspace containment通過後のresolved absolute pathだけを渡す。
  - missing sourceではloaderを呼ばずresolver/previewをfail-closed。
  - explicit `mode=card` ではloaderを呼ばずread-only preview成功。
  - loader例外を `PREVIEW_WORKBOOK_LOAD_FAILED` としてReceipt内へ保持しAuthority bindingをblocked。
  - loaderがsourceを変更したfixtureでpost-load digest差分を検出し `SOURCE_CHANGED_DURING_PREVIEW` / blocked。
  - preloaded `workbook` と `workbookLoader` の同時指定を拒否。
  - default-loader wrapperのdynamic-import/port contractをCSV loader stubで実行しsatisfiedを確認。
- ローカル検証環境にはproductionのpinned `xlsx` dependencyがないため、実 `loadWorkbook` + SheetJS経路をローカル成功実績としては主張しない。
- repository test sourceには通常dependency環境で `runExecutableProposalAuthorityEvidenceWithDefaultLoader` + CSVを直接通すfocused testを追加。
- source digestはloader呼出前後に再計算し、load/preview窓でsourceが変化した場合はpreview成功の有無にかかわらずAuthority Evidenceをblockedにする。
- production `workbookLoader.ts` / parser / resolver / renderer / plugin / extensionは変更していない。
- fill telemetry / external-XLSX fixture・評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
