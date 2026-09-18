# External XLSX fixture provenance

## libreoffice-rgb-format-boundary.xlsx.base64

Purpose:

- validate worksheet-format reading against an XLSX whose final bytes were written by LibreOffice, not SheetJS
- provide direct RGB solid-fill evidence
- preserve merge, blank-cell, metadata-preamble, gapped-header, and title-less cases in one small workbook

Decoded SHA-256:

```text
ac561a7f5ca19aeb642fe288a897e036081811274ffd109938215e49e94393e1
```

Generation environment:

```text
LibreOffice 25.2.3.2 520(Build:2)
OpenPyXL 3.1.5
```

Generation process:

1. Build a small workbook with OpenPyXL.
2. Add direct RGB solid fills and merge ranges.
3. Save the source workbook.
4. Re-open and re-save it using LibreOffice Calc's Office Open XML exporter.
5. Independently read the final XLSX with OpenPyXL.
6. Verify key fill and merge properties.
7. Base64-encode the final XLSX for text-safe repository storage.

Independent final-file checks:

| Sheet | Cell / merge | Expected final-file property |
|---|---|---|
| RGB Fill | A1:D1 | merged |
| RGB Fill | A2 | solid fill, RGB FF202020 |
| Metadata Gapped | B3:F3 | merged |
| Metadata Gapped | B4 | solid fill, RGB FF404040 |
| No Title | A1 | solid fill, RGB FF202020 |

Why base64:

The GitHub contents workflow used for this repository writes UTF-8 text files. Base64 keeps the binary XLSX fixture byte-exact and allows tests to verify the decoded SHA-256 before parsing.

This fixture does not establish a guarantee for theme-indexed colors. Theme-only fill is evaluated separately.
