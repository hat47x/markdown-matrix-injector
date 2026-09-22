# MMI Worksheet -> Structured Artifact Neutral Observation Adapter v0

## 1. Position

This adapter is research-only for GitHub Issue #218 SAI-0/H2.

It does not replace:
- WorksheetFormatSnapshot
- Format Profile
- Fly matcher
- review-route
- MMI Notation

The neutral observation remains a lossy projection.

## 2. Source observation

Input is the existing `WorksheetFormatSnapshot`.

The adapter does not read XLSX directly and does not widen filesystem authority.

A separate caller may obtain the snapshot through the existing contained XLSX path.

## 3. Region

The neutral region is the bounding rectangle of cells whose normalized text is non-empty.

MMI coordinates are zero-based internally.
Neutral coordinates are one-based inclusive.

Style-only cells do not widen the region.

An observation with no non-empty text cells is rejected rather than inventing a 0x0 region.

## 4. Features

### geometry.non_empty_ratio

```text
non-empty text cells
--------------------
slots in non-empty bounding rectangle
```

Method:
`mmi-snapshot-non-empty-bounds-v1`

This is not the same method as the normalizer visible-only ratio because MMI snapshot does not preserve hidden row/column visibility.

### geometry.merged_cell_count

Count merges that overlap the observed region.

Method:
`mmi-snapshot-region-merge-count-v1`

### role.header_candidate_signal

Reuse `extractWorksheetFormatFeatures`.

Values:
- present
- absent

Method includes `WORKSHEET_FORMAT_FEATURE_VERSION`.

It is a derived candidate signal, not a structural label.

## 5. Missing features

Do not emit:
- border_closure
- grid_alignment
- merge_ambiguity
- topology_consistency
- repeated row/column signals
- body candidate

unless future executable MMI observations provide a defensible mapping.

Missing is not zero.

## 6. Provenance digest

The source observation digest hashes canonical:
- producer schema marker
- sheet name
- sorted snapshot cells
- sorted merges

A style/text change may change provenance even when the projected neutral feature happens to remain numerically equal.

## 7. Adapter config identity

Static adapter config digest binds:
- adapter version
- non-empty method
- merge method
- worksheet format feature version used for header signal
- explicit absence of hidden row/column visibility

## 8. Cross-repo comparison

H2 must preserve:
- region disagreement
- method disagreement
- missing features
- producer provenance

The adapter does not coerce MMI output to match excel-normalizer output.

## 9. Non-goals

- matching normalizer numeric values
- model training
- runtime schema extraction
- automatic label creation
- product confidence comparison
- production UI/routing
