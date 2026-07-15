# Changelog

All notable changes to Markdown Matrix Injector (MMI) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Conformance corpus: 19 executable cases
- MMI Notation v1 specification (RFC 2119 normative, 8 principles, conformance levels L0–L3)
- Machine-readable contract: JSON Schema (`params.schema.json`)
- Standalone pattern guide for SIer design document table patterns
- Preview styles: `markdown.previewStyles` contribution with screen/print CSS
