# G3/G4 Gate Closure Evidence — Read-Only Guarantee & Honest Limitations

- Date: 2026-07-15
- Operator: automated verification (Claude Code agent)
- Source: ADR-0010 G3/G4 definitions, existing test corpus, codebase audit

## G3: Data Integrity — Source Files Are Never Modified

### Architectural guarantee

The MMI render pipeline is **structurally read-only**. A full-source audit (`grep -rn "writeFile\|createWriteStream" src/`) confirms:

> **[2026-07-15 訂正]** 初版のこの表は実在しないパス（`src/resolver/*.ts`, `src/loader/*.ts`）を
> 記載していた。実リポジトリ構成（`src/core/` 配下）へ修正済み。監査結論自体は再検証の上で維持。

| Component | Write operations | Verdict |
|---|---|---|
| `src/core/render*.ts` (render pipeline) | 0 | ✅ Read-only |
| `src/plugin/markdownMatrixPlugin.ts` | 0 | ✅ Read-only |
| `src/core/pathResolver.ts` (file resolution) | 0 (`fs.existsSync` のみ) | ✅ Read-only |
| `src/cache/workbookCache.ts` | 0 | ✅ Read-only (in-memory only) |
| `src/core/workbookLoader.ts` (file loading) | 0 (`XLSX.readFile` / `fs.readFileSync` のみ) | ✅ Read-only |
| `src/extension.ts` | `fs.writeFile` はマニフェスト/エビデンス出力のみ | ✅ Only writes **derived artifacts**, never source data |

The only `writeFile` operations in the entire codebase produce **derived outputs** (delivery manifest CSV, benchmark reports) — never touching the source Excel/CSV/XML files referenced by `![[...]]` embeds.

### Test evidence

Automated verification in `03_Implement/test/enterpriseOutput.test.ts`:

```
test('enterprise output (G3): rendering does not modify source CSV files')
```

This test:
1. Reads a real CSV fixture (`req-trace.csv`) before rendering
2. Renders a `![[...]]` embed referencing that file
3. Reads the same file after rendering
4. Asserts byte-identical content (`before === after`)

> **[2026-07-15 訂正・重要]** 本ゲート判定時に引用されたこのテストは、当時 unawaited な
> `import('node:fs').then(...)` の中でアサーションを実行しており、**テスト本体が Promise 解決前に
> 完了するため失敗しても検知されない空洞化した検証**だった。同日中に同期実装へ修正し、
> アサーションが確実に実行される状態で再実行・PASS を確認した（修正後スイートで全 pass）。
> G3 の実質根拠は上記の構造監査（write 経路の不存在）+ 修正後テストの両輪である。

**Result**: ✅ PASS（テスト修正後の全スイートで確認、2026-07-15）

### Scope of guarantee

The read-only guarantee applies to **all supported source formats** (CSV, TSV, XLSX, XML Spreadsheet 2003) because:
- All formats go through the same read-only resolution pipeline
- No format-specific write path exists anywhere in the codebase
- The `WorkbookCache` is in-memory only; cache eviction does not write back to disk

This is a **structural property** of the architecture, not a format-by-format convention. Per ADR-0012 D3-1, read-only is a normative MUST in the MMI Notation specification.

## G4: Honest Limitations — Measurement-Based

### Degradation behavior (automated tests)

All invalid/unsupported parameter values are **silently dropped** rather than causing errors — verified in `enterpriseOutput.test.ts`:

| Test | What is verified | Result |
|---|---|---|
| Invalid `pageBreak` value | `data-page-break` attribute absent, table still renders | ✅ PASS |
| Invalid `orientation` value | `data-orientation` attribute absent, table still renders | ✅ PASS |
| Non-existent sheet | `MMI_SHEET_NOT_FOUND` error card rendered | ✅ PASS |
| Non-existent file | `MMI_FILE_NOT_FOUND` error card rendered | ✅ PASS |

### Known limitations (measurement-confirmed)

The following limitations are based on actual test behavior and codebase analysis, not speculation:

1. **PDF generator dependency (G2 scope)**: `pageBreak` / `orientation` HTML attributes are emitted correctly by MMI. Their reflection in final PDF output depends on the PDF generator. Verified working: WeasyPrint 69.0, VS Code Markdown PDF (Chromium-based). Pandoc alone does NOT expand MMI embeds — the `![[...]]` survives as literal text.

2. **XML format**: Only XML Spreadsheet 2003 is supported. Generic/non-spreadsheet XML produces an `MMI_INVALID_XML` error card. Verified by `src/core/workbookLoader.ts`, which checks the `mso-application progid="Excel.Sheet"` signature before parsing.（訂正: 初版は実在しない `src/loader/xmlLoader.ts` を記載していた）

3. **Smart Fallback thresholds**: Tables with ≥10 columns OR ≥500 cells auto-degrade to card view. This is tunable via `mode` parameter (`card` / `table` / `auto`). The 10/500 thresholds are empirically chosen for VS Code preview viewport typical widths (~80-120 chars). Verified in `smartFallback.test.ts`.

4. **Path resolution containment**: ネットワーク/リモートソースは非対応（コアにネットワーク取得なし、spec P4）。
   **【2026-07-15 再訂正・issue-0105 Done】** `src/core/pathResolver.ts` に境界検査
   （`isPathWithinBoundary` + `PathContainmentError`）を実装済み。`..` による境界外への遡上は
   `path.relative` ベースで検出し、シンボリックリンク経由の迂回も `fs.realpathSync` で解決してから
   検査するため防止される。境界は `workspaceRoot` があればその配下、無ければ Markdown ファイルの
   親ディレクトリ（保守的）。違反時は `PathContainmentError`（message: `outside workspace boundary`）が
   `markdownMatrixPlugin.ts` の既存 catch を通り `mmi-error` として可視化される（P2 準拠）。
   `test/pathResolver.test.ts`（10 tests: 正当な `../data/x.csv` 解決・境界外拒否・シンボリックリンク
   迂回拒否/許可）で固定。spec `mmi-notation-v1.md` §4/P4 の Containment MUST を実装が満たす。

5. **Host/version constraints**: The extension declares `engines.vscode: ^1.96.0`（訂正: 初版の「≥1.85.0」
   は package.json の実宣言と不一致だった）. Tested on: VS Code 1.97.2 (Linux, WSL2). Not tested on:
   VS Code for Web (github.dev), Codespaces, Cursor, Windsurf.

6. **Emoji rendering in headless CI**: `✅`/`❌` used in documentation tables render as `.notdef` boxes in headless WeasyPrint environments without emoji fonts. Cosmetic only — does not affect MMI embed rendering. Confirmed in `manual-e2e-g1-g2-result-2026-06-03.md`.

7. **Preview vs print CSS**: Highlight colors (`mmi-table__row--highlight`) and card borders are `@media screen` only. Print output uses monochrome-safe styling. Page break (`data-page-break`) and orientation (`data-orientation`) are `@media print` only — they have no visual effect in screen preview, which is correct behavior.

8. **Concurrent file access**: The `WorkbookCache` is per-extension-activation, shared across preview tabs. Concurrent renders of the same file share the cache. File modification by external applications (e.g., Excel saving while preview is open) is detected via mtime comparison and triggers cache invalidation — no stale data is served.

9. **Character encoding**: Source files are read as UTF-8. Shift-JIS (common in Japanese enterprise environments) is NOT auto-detected. Files in other encodings produce garbled output or parse errors. This is an honest gap — auto-detection of legacy Japanese encodings is not implemented.

## Verdict

G3 (read-only guarantee) and G4 (honest limitations) are **SATISFIED**（2026-07-15 の事実検証・訂正後の判定）:
- G3 is structurally guaranteed by the codebase architecture（write 経路の不存在）and verified by the
  **corrected** automated test（初版が引用したテストは空洞化しており、同日修正のうえ再確認した）
- G4 limitations are documented based on actual test behavior and codebase analysis — 初版に含まれていた
  実装と不一致な記述（存在しないパス・containment 拒否・VS Code 最低バージョン）は本訂正で実測に揃えた
- 追記（同日）: spec P4 Containment ギャップは `issue-0105` として起票・**同日中に是正・Done**。
  `pathResolver.ts` に境界検査を実装し、`test/pathResolver.test.ts`（10 tests）で固定済み
  （224 tests 全体 pass、2026-07-15 現在）。詳細は上記項目 4 を参照。

The product completion gate (G1–G4) is now formally closed. Distribution-phase issues (0095, 0096) are unblocked per ADR-0010.
