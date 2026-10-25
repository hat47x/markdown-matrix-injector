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
525adf8be480e1db1a3ddfbe81465c176d8ba12553efdfa74a8c6ba2dcff4819
```

Generation environment:

```text
LibreOffice 25.2.3.2 (bbb074479178df812d175f709636b368952c2ce3, official Linux x86-64 deb archive)
OpenPyXL 3.1.5
```

History:

- The first version of this fixture (SHA-256 `45d925f4e7d26e5110d05f79a22b2d9b0d67ec73ca8db581cf0a7633d93a4a07`)
  was stored through a text channel and its base64 text was damaged (one
  flipped byte in `xl/workbook.xml`, a flipped bit and truncated records in the
  central directory), so the committed file could not be opened. The original
  bytes were reconstructed from the surviving data and verified against that
  SHA-256.
- The original workbook was also inconsistent with the purpose below: the body
  of `Theme Dark` lacked cell `C3`, so `Theme Dark` and `Theme Light Tint`
  differed in structure as well as in fill, and structure-only matching could
  never be ambiguous between them. This version was regenerated with the
  process below, with the `Theme Dark` body laid out like `Theme Light Tint`
  (`D-001`/`D-002` rows, `Owner` = `A`/`B`).

Generation process:

1. Build an XLSX source with OpenPyXL using theme-indexed solid fills.
2. Use theme index 3 for a dark2 fill and theme index 3 + tint 0.8 for a lightened fill.
   `Theme Dark` and `Theme Light Tint` share the same title, header labels and a
   fully populated 2-row body, so that only the header fill tone differs.
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

## libreoffice-fill-impact-family.xlsx

Purpose:

- reproduce the four remaining high-impact fill telemetry reasons using external XLSX sheets rather than synthetic snapshots
- keep each case inside one small related template family with fixed title merge, contiguous headers, and three body rows
- distinguish structural drift from fill support/conflict using actual LibreOffice-finalized workbook bytes

Decoded / stored XLSX SHA-256:

```text
aeeb605c4bcd88a02df6ecf09a83db962141d6f6c90bd96375d67feeeb937973
```

Generation environment:

```text
LibreOffice 25.2.3.2 520(Build:2)
OpenPyXL 3.1.5
```

Generation process:

1. Build one workbook family with OpenPyXL.
2. Use the same title-row + header-row + three-body-row layout for every sheet.
3. Vary only the header labels and direct RGB header fill needed for each telemetry boundary.
4. Re-open and re-save the workbook with LibreOffice Calc's Office Open XML exporter.
5. Independently read the final XLSX with OpenPyXL.
6. Verify every header, fill, and merge after the LibreOffice save.
7. Store the final binary XLSX byte-for-byte in the repository using the Git data API.

Independent final-file checks:

| Sheet | Headers / role | Header fill | Merge |
|---|---|---|---|
| W6 Base Dark | ID, Item, Type, Required, Decision, Reviewer | FF202020 | A1:F1 |
| W6 Two Drift Dark | Code, Item, Name, Required, Decision, Reviewer | FF202020 | A1:F1 |
| W6 Base No Fill | same as W6 Base Dark | none | A1:F1 |
| W6 Wrong Dark | ID, Item, Type, Required, Decision, Memo | FF202020 | A1:F1 |
| W8 Base Dark | ID, Item, Type, Required, Decision, Reviewer, Note, Owner | FF202020 | A1:H1 |
| W8 Two Drift Dark | Status, Item, Type, Required, Decision, Role, Note, Owner | FF202020 | A1:H1 |
| W3 Base Dark | ID, State, Note | FF202020 | A1:C1 |
| W3 A Code Dark | Code, State, Note | FF202020 | A1:C1 |
| W3 B Category Light | ID, Category, Note | FFF2F2F2 | A1:C1 |

Telemetry coverage:

- W6 Two Drift Dark vs W6 Base Dark:
  `fill-supported-acceptance`
- W6 Base Dark vs W6 Base No Fill / W6 Wrong Dark:
  `fill-induced-ambiguity`
- W8 Two Drift Dark vs W8 Base Dark:
  `fill-induced-rejection`
- W3 Base Dark vs W3 A Code Dark / W3 B Category Light:
  `fill-changed-winner`
  together with `fill-supported-disambiguation` and the broad diagnostic
  `fill-tone-disagreement`

Why this fixture is stored as a binary XLSX while the earlier fixtures are base64 text:

The earlier external fixtures were created through the GitHub Contents API, which is text-oriented in this workflow. For this fixture the Git data API was used directly, so the byte-exact XLSX can be stored without an intermediate base64 repository file.

The SHA-256 check remains mandatory in the test so the storage form does not weaken provenance.
