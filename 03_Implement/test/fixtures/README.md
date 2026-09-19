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

## libreoffice-theme-fill-boundary.xlsx.base64

Purpose:

- verify that theme-indexed fills survive an external LibreOffice XLSX save
- distinguish theme resolution from MMI bridge classification
- verify SheetJS theme-to-RGB and tint-to-RGB behavior before the bridge
- carry a direct-RGB control in the same workbook

Decoded SHA-256:

```text
45d925f4e7d26e5110d05f79a22b2d9b0d67ec73ca8db581cf0a7633d93a4a07
```

Generation environment:

```text
LibreOffice 25.2.3.2 520(Build:2)
OpenPyXL 3.1.5
```

Generation process:

1. Build an XLSX source with OpenPyXL using theme-indexed solid fills.
2. Use theme index 3 for a dark2 fill and theme index 3 + tint 0.8 for a lightened fill.
3. Add a direct RGB `FF202020` sheet as a control.
4. Re-open and re-save the workbook with LibreOffice Calc's Office Open XML exporter.
5. Independently inspect the final XLSX using OpenPyXL and ZIP/XML.
6. Base64-encode the final bytes and fix their SHA-256.

Independent final-file checks:

| Sheet | Cell | Final OOXML / theme property |
|---|---|---|
| Theme Dark | A2 | solid fill, `fgColor theme="3"` |
| Theme Light Tint | A2 | solid fill, `fgColor theme="3" tint="0.8"` |
| RGB Control | A2 | solid fill, RGB `FF202020` |
| workbook theme | dark2 | `1F497D` |

Why theme 3 and tint 0.8:

- theme 3 resolves to `1F497D`, which the current coarse classifier treats as `dark`
- applying SheetJS's tint algorithm with 0.8 yields `C6D9F1`, which the current classifier treats as `light`

This makes the fixture diagnostic:

- unresolved theme would remain `other`
- theme resolution without tint would stay `dark`
- correct theme + tint resolution becomes `light`

The fixture therefore tests more than the presence of a theme index; it tests that the parser supplies the resolved RGB expected by the existing bridge.
