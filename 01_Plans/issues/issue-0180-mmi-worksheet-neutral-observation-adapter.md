# Issue: MMI worksheet snapshotからstructured-artifact neutral observation v0をemitする

## Meta
- Type: Research / Cross-repo structured-artifact intelligence
- Status: Open
- Priority: High
- Scope: research-only WorksheetFormatSnapshot -> neutral observation adapter
- Expected verification level: unit + focused validation
- Production runtime: 変更しない

## Traceability
- Depends on: GitHub Issue #218 SAI-0A/H1 neutral contract merged
- Related: excel-houganshi-normalizer #20 / PR #21 / PR #22
- Related architecture: structured-artifact-neutral-observation-v0.md

## Problem

MMI mainには strict neutral observation v0 contract/validator はあるが、
WorksheetFormatSnapshot から実際のneutral rowをemitするadapterがない。

excel-houganshi-normalizer側は既に独立adapterを持ち、H2 divergence evaluatorまでmerge済み。
次のreal matched-fixture H2 evidenceにはMMI側の独立emitterが必要。

## Decision

research-onlyな
`createMmiWorksheetStructuredArtifactObservation`
を追加する。

入力:
- WorksheetFormatSnapshot
- sheetName
- sourceDigest
- sourceFamilyId
- workbookOrDocument
- producerVersionOrGitSha
- sourceFormat = xlsx | synthetic
- privacyClass
- split / mutationFamily

出力:
- `hat47x.structured-artifact-observation/v0`

## Observable features

現行MMI snapshotから実際に観測可能なものだけを出す。

### geometry.non_empty_ratio
- normalized non-empty text cell count
- non-empty bounding rectangleのslot数をdenominator
- hidden row/column情報は使わない
- method: `mmi-snapshot-non-empty-bounds-v1`

### geometry.merged_cell_count
- observed non-empty regionとoverlapするmerge数
- method: `mmi-snapshot-region-merge-count-v1`

### role.header_candidate_signal
- existing `extractWorksheetFormatFeatures` のheaderRow有無
- present / absent
- methodにcurrent worksheet format feature versionを含める

## Explicit non-equivalence with normalizer

excel-normalizerはvisible row/columnを考慮する。
MMI WorksheetFormatSnapshotはhidden row/column visibilityを保持していない。

したがって同じfeature名でも:
- method IDをnormalizerと同一にしない。
- numeric deltaがH2で自動的に比較可能とは主張しない。
- region boundary disagreementを正規化して消さない。

## Provenance

neutral provenance:
- source_observation_ref = MMI worksheet snapshot reference
- source_observation_digest = canonical snapshot content digest
- adapter_config_digest = adapter version/method/version setのstatic digest

source observation digestには:
- sheetName
- cells(row/column/text/fill/border)
- merges
をcanonical sortして含める。

## Stop lines

- review-route != structural label
- matched/ambiguous/novel != neutral geometry feature
- missing hidden visibility != visible
- architecture intent != observed feature
- neutral adapter != production runtime schema

## Acceptance criteria

- [ ] research-only adapter moduleを追加。
- [ ] existing neutral validatorを最終境界で再利用。
- [ ] non-empty boundsをone-based inclusiveへ変換。
- [ ] non-empty ratioを実測。
- [ ] observed region overlap merge countを実測。
- [ ] existing header heuristicのpresent/absentをcategorical signalとしてemit。
- [ ] labelsを空に保つ。
- [ ] review-route / matcher classification / provider dataを含めない。
- [ ] source snapshot digestをdeterministicに生成。
- [ ] snapshot cell/merge order違いで同じsource observation digest。
- [ ] adapter_config_digestをstatic canonical configから生成。
- [ ] hidden visibility未保持をmethod ID/provenanceで明示。
- [ ] style-only cellはnon-empty boundsへ含めない。
- [ ] empty snapshotはfail-closed。
- [ ] invalid digest / metadataをfail-closed。
- [ ] source snapshotをmutateしない。
- [ ] production parser/resolver/renderer/review-routeを変更しない。
- [ ] model/trainingを追加しない。

## Validation plan

- canonical whole-sheet fixture。
- style-only cells outside bounds。
- merge overlap count。
- header candidate present/absent。
- input order permutation。
- empty snapshot。
- malformed metadata。
- immutability。
- neutral contract validation。
