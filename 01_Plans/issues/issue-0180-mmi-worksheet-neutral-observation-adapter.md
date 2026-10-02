# Issue: MMI worksheet snapshotからstructured-artifact neutral observation v0をemitする

## Meta
- Type: Research / Cross-repo structured-artifact intelligence
- Status: Done
- Priority: High
- Scope: research-only WorksheetFormatSnapshot -> neutral observation adapter
- Expected verification level: unit + focused validation
- Production runtime: 変更しない

## Traceability
- Depends on: GitHub Issue #218 SAI-0A/H1 neutral contract merged
- Related: excel-houganshi-normalizer #20 / PR #21 / PR #22
- Related architecture: structured-artifact-neutral-observation-v0.md

## Problem

MMI mainにはstrict neutral observation v0 contract/validatorはあるが、
WorksheetFormatSnapshotから実際のneutral rowをemitするadapterがない。

excel-houganshi-normalizer側は既に独立adapterを持ち、H2 divergence evaluatorまでmerge済み。
次のreal matched-fixture H2 evidenceにはMMI側の独立emitterが必要。

## Decision

research-onlyな
`createMmiWorksheetStructuredArtifactObservation`
を追加する。

入力は次のとおりです。
- WorksheetFormatSnapshot
- sheetName
- sourceDigest
- sourceFamilyId
- workbookOrDocument
- producerVersionOrGitSha
- sourceFormat = xlsx | synthetic
- privacyClass
- split / mutationFamily

出力は次のとおりです。
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

- [x] research-only adapter moduleを追加。
- [x] existing neutral validatorを最終境界で再利用。
- [x] non-empty boundsをone-based inclusiveへ変換。
- [x] non-empty ratioを実測。
- [x] observed region overlap merge countを実測。
- [x] existing header heuristicのpresent/absentをcategorical signalとしてemit。
- [x] labelsを空に保つ。
- [x] review-route / matcher classification / provider dataを含めない。
- [x] source snapshot digestをdeterministicに生成。
- [x] snapshot cell/merge order違いで同じsource observation digest。
- [x] adapter_config_digestをstatic canonical configから生成。
- [x] hidden visibility未保持をmethod ID/provenanceで明示。
- [x] style-only cellはnon-empty boundsへ含めない。
- [x] empty snapshotはfail-closed。
- [x] invalid digest / metadataをfail-closed。
- [x] source snapshotをmutateしない。
- [x] production parser/resolver/renderer/review-routeを変更しない。
- [x] model/trainingを追加しない。

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


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上のadapter sourceと同一実装を、neutral contract / WorksheetFormatSnapshot / feature-versionのinterface-compatible依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime: **5/5 PASS**。
  1. non-empty bounding regionをone-based inclusiveでemit。
  2. 9/12 non-empty ratio、observed-region overlap merge count=1、header candidate=presentを確認。
  3. style-only cellとregion外mergeがbounds/countを拡張しない。
  4. cell/merge入力順を反転してもsource_observation_digest不変。
  5. single-cell snapshotではheader candidate=absentを明示。
  6. empty text-only observation / malformed sourceDigest / blank sheetNameをfail-closed。
  7. source snapshotをmutateしない。
- emitted labelsは空。
- matched / ambiguous / novel / review-route / provider confidence / winner prototype IDをneutral outputへ持ち込まない。
- normalizer visible-only methodと同一method IDを名乗らず、hidden row/column visibility unavailableをadapter_config_digestへbinding。
- production parser / resolver / renderer / review-route / matcher thresholdは変更していない。
- model/training dependencyは追加していない。
- repository全dependency tree成功は現環境では主張しない。
