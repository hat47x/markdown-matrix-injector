# Changelog

All notable changes to Markdown Matrix Injector (MMI) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Return the preview API from activation and resolve source paths during rendering, matching VS Code's separate parse/render lifecycle.
- Exclude query parameters from file/sheet names in diagnostics for card and whole-sheet references.
- Replace the non-working Markdown command link with a workspace-validated extension URI for external opening (ADR-0015; see the release validation record for GUI status).
- Updated Markdown parsing dependencies and moved SheetJS to the official 0.20.3 distribution.
- Read workbook bytes explicitly for SheetJS ESM compatibility while keeping source access read-only.
- Enforced LF for shell scripts used from Windows checkouts in WSL.

### Added
- Twelve Japanese practical examples with 172 CSV records, a three-sheet Excel workbook, SpreadsheetML and TSV data.
- Japanese tutorial, user manual, real preview captures and a three-page PDF sample; source-integrity and sample-row verification.

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
