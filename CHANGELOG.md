# Changelog

All notable changes to Markdown Matrix Injector (MMI) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Word (.docx) Source Adapter** (ADR-0026, #531): read-only observation of explicit heading styles/outline levels, tables (including `gridSpan`/`vMerge`), embedded pictures and comments as `section`, `table-range`, `image` and `note` Candidates. `mmi inspect` lists them; `mmi extract --docx-table` / `--docx-image` require the reviewed fingerprint and write content-addressed assets with ledger provenance. Nested tables, external image links, unsupported media and missing optional parts are reported as diagnostics without stopping the rest. `inspect --json` also returns a Section Tree of explicit headings with preamble and owned top-level blocks (level jumps are not invented). Not a Linked target for MMI Notation yet.

## [0.2.0] - 2026-10-20

Verification release (ADR-0025): distributed as a VSIX and a self-contained CLI tarball with release evidence. Extension and package identifiers are unchanged and may still move before the first Marketplace / npm registry release (#504, #517). The notation (MMI Notation v1, Draft), `MMI_*` diagnostic codes and `mmi.*` contract names are unchanged.

### Added
- **CLI** (`mmi`): `inspect`, `extract`, `import`, `select` / `find`, `check`, `render`, `snapshot`, `materialize`, `detach-check`, `manifest`, `impact`, `schema`, static HTML fragments (`html-plan`) and local AI handoff / re-validation (`handoff`, `validate-*`). Ships as a self-contained npm tarball (Node.js 20+) that installs offline (#500).
- **Candidate contract** `mmi.semantic-candidate/v1` and the import ledger `mmi.ledger/v1`: tables, Excel embedded images, choice lists, AutoShapes / connectors (observed, not yet extracted), and Tree Candidates from JSON, safe-subset YAML, generic XML, flat text and explicit Excel / CSV hierarchy columns, all with provenance and change detection.
- **Extracted state**: selected tables and images are taken into standard Markdown or image assets and tracked in the ledger; stale sources are reported before detach.
- **Detached state** (minimum slice): `materialize` turns MMI references into standard Markdown; `detach-check` reports remaining references, unmaterialized markers and broken or out-of-root links (#499).
- **VS Code**: workbook import (tables stay Linked, .xlsx/.xlsm images become Extracted assets), Candidate review with accept / reject / defer, guided reference authoring and editing, search by description, hover preview, source impact listing, re-check after the source is saved, and quick fixes for sheet, file, parameter, `x-headers` and `x-below` drift.
- Experimental notation keys for semantic selection `x-headers`, `x-table`, `x-name` (ADR-0022) and recorded expectations `x-below`, `x-binding`.
- Japanese command names, walkthrough and l10n; basic design document kit; AI instruction pack (`skills/mmi`); AI writing benchmark v0.
- Twelve Japanese practical examples with 172 CSV records, a three-sheet Excel workbook, SpreadsheetML and TSV data.
- Japanese tutorial, user manual, real preview captures and a three-page PDF sample; source-integrity and sample-row verification.
- `npm run release:candidate`: builds a candidate from one commit (version consistency, full type check, product tests, VSIX audit including the runtime module closure, offline CLI install check, optional Extension Host E2E) and writes `release-evidence.json`, `SHA256SUMS` and release notes bound to the commit and artifact hashes (ADR-0025).

### Fixed
- Quick fixes on the line being typed are offered from the light bulb again: diagnostics held back from the Problems panel while typing (ADR-0019 D13) still feed code actions (#579).
- Path containment: a file whose name starts with `..` (e.g. `..notes.csv`) inside the workspace is no longer rejected, and a workspace reached through a symlinked or junctioned directory is compared by its real path.
- The documented minimum VS Code version is 1.100.0, matching `engines.vscode` (ESM extension); README and tutorial said 1.96.0.
- Windows development: `npm test` and the release-gate tools no longer depend on a working `python3` command (the Microsoft Store stub), test path expectations are separator-independent, symlink tests skip when the OS refuses symlinks, and the type check of the whole project (`npm run build`) passes again.
- Return the preview API from activation and resolve source paths during rendering, matching VS Code's separate parse/render lifecycle.
- Exclude query parameters from file/sheet names in diagnostics for card and whole-sheet references.
- Replace the non-working Markdown command link with a workspace-validated extension URI for external opening (ADR-0015; see the release validation record for GUI status).
- Updated Markdown parsing dependencies and moved SheetJS to the official 0.20.3 distribution.
- Read workbook bytes explicitly for SheetJS ESM compatibility while keeping source access read-only.
- Enforced LF for shell scripts used from Windows checkouts in WSL.

### Known issues
- On a Windows desktop the automated Paste As test sometimes inserts the clipboard text instead of the MMI content-match reference (seen on VS Code 1.140.0 and 1.142.0; other runs of the same commit pass). It has not been seen with people choosing from the Paste As menu (#603).
- Pasting an Excel range relies on what the source application puts on the clipboard; Windows Excel HTML/helper formats still need checks on a real machine (#495).

## [0.1.0] - 2026-07-15

### Added
- Initial VS Code extension release (L3 reference implementation)
- `![[<target>#<sheet>|<range>?<params>]]` embed notation for Markdown
- Excel (.xlsx), CSV (.csv, .tsv), XML Spreadsheet 2003 (.xml) data source support
- Query parameters: `mode`, `header`, `columns`, `transpose`, `grep`, `highlightColumn`, `highlightValue`, `formatColumn`, `caption`, `id`, `pageBreak`, `orientation`
- Smart Fallback: auto-degrade large tables to link cards (with open-source affordances per ADR-0011)
- Enterprise print control: `pageBreak`, `orientation` (portrait/landscape)
- Delivery Manifest command: `MMI: Generate Delivery Manifest`
- Open Embed Source command: `MMI: Open Embed Source` (card button → OS default app)
- Diagnostics (link check): missing file, missing sheet, invalid XML detection
- Paste/drop provider: native VS Code paste and drag-drop embed insertion
- Auto-completion for file paths, sheets, ranges, and query parameters
- Conformance corpus: 20 executable cases
- MMI Notation v1 specification (RFC 2119 normative, 8 principles, conformance levels L0–L3)
- Machine-readable contract: JSON Schema (`params.schema.json`)
- Standalone pattern guide for SIer design document table patterns
- Preview styles: `markdown.previewStyles` contribution with screen/print CSS
- Card open affordance: title links to source (baseline), "外部アプリで開く" button fires `env.openExternal` in trusted previews (ADR-0011)
- Path containment: embed source resolution now rejects `..` traversal outside the workspace boundary, with symlink-bypass defeat and a Problems-panel diagnostic (`MMI_PATH_OUTSIDE_BOUNDARY`)

### Fixed
- CSV loader now correctly handles RFC4180-quoted cells (commas, embedded newlines, and `""`-escaped quotes inside quoted fields) instead of naively splitting on every comma, which silently misaligned columns for any real-world CSV with a quoted comma (e.g. `"Smith, John"`)
- Phase 9 benchmark CSV data: `QueryExample` values are now properly quoted, fixing a real column-misalignment (13 header columns vs. 17 parsed data columns) when the file is embedded via `![[...]]`; the standalone pattern guide generator and test loader were simplified to a standard CSV parser now that the underlying data is correctly quoted
- Release gate: added `G4:Phase9GuideSync`, catching drift between the docs CSV and the generated standalone pattern guide before release
- XLSX date cells now render as unambiguous ISO-8601 (`YYYY-MM-DD`) instead of SheetJS's locale-ambiguous short form (e.g. `4/3/26`, which can be misread as either April 3 or March 4) — relevant to the `EffectiveFrom`/`ExpiresAt` date columns common in SIer design documents; non-date numeric and text cells are unaffected
- Packaged `.vsix` now bundles a `LICENSE` file (`vsce package` previously warned `LICENSE, LICENSE.md, or LICENSE.txt not found` because the extension root, `03_Implement/`, had no license file of its own even though the repository root does)
