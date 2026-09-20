# Issue: Worksheet review-routeのblinded label corpus契約を実装する

## Meta
- Type: Evaluation data / Labeling protocol
- Status: Done
- Priority: High
- Scope: provider-blinded route labels, strict corpus schema, adjudication eligibility, unlabeled seed corpus
- Expected verification level: unit + fixture validation
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0167 Done
- Related: issue-0165 Jev Worksheet Review Route
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0167で評価器は完成したが、expected inspect/routineをprovider出力を見てから付けると評価が循環する。
また既存の `expectedReview` はdeterministic signal評価用でありroute labelへ流用できない。

## Decision

`WorksheetReviewRouteLabelCorpusV1` を追加し、route labelをprovider結果から独立管理する。

corpus-level blinding:
- provider output hidden
- provider identity hidden
- model identity hidden
- probability hidden
- confidence hidden

これらは全て `true` 固定。

case:
- evidence
- optional current projection state
- independent annotations
- optional adjudication

**issue-0167の性能評価へ使えるのはadjudication済みcaseだけ**とする。

## Annotation semantics

annotationはprovider outputを見ずに:
- route
- rationale codes
- annotation reference
- annotator reference

を記録する。

adjudicationは:
- final route
- rationale codes
- adjudication reference
- adjudicator reference

を記録する。

provider result/confidence/modelはcorpus schemaへ保存しない。

## Seed corpus

初期fixtureは既存worksheet evaluationで既に存在するscenario familyを参照するが、route labelは付けない。

seedの目的:
- annotation対象の多様性を確保
- matched / ambiguous / novel
- fill decision-impact
- evidence unavailable
- diagnostic-only variation
- multi-family drift

を含む候補集合を準備すること。

既存 `expectedReview` は読み込まず、seed routeは全件未確定。

## Acceptance criteria

- [x] corpus/schema/protocol versionを固定。
- [x] provider-blinding fieldsを全てtrue固定。
- [x] unknown fieldsをfail-closed。
- [x] case idをuniqueにする。
- [x] evidence source/family/reference/factsを検証。
- [x] projection stateはoptionalでissue-0165 state shapeだけを許可。
- [x] annotation route/rationale/referenceを検証。
- [x] annotator ref重複を拒否。
- [x] adjudicationには少なくとも1 annotationを要求。
- [x] adjudication済みcaseだけをevaluation labelとして抽出。
- [x] projection evaluation抽出時はprojection state必須。
- [x] provider choice/probability/confidence/model fieldsをschemaへ持ち込まない。
- [x] seed corpusはroute label/adjudicationを持たない。
- [x] seed corpusは複数scenario familyを含む。
- [x] 既存expectedReviewをroute labelに流用しない。
- [x] production routing/live providerを変更しない。

## Validation plan

- valid pending corpus。
- valid annotated/adjudicated corpus。
- unknown provider field rejection。
- blinding false rejection。
- duplicate case/annotator rejection。
- adjudication without annotation rejection。
- invalid route/rationale rejection。
- projection state validation。
- adjudicated label extraction。
- missing projection rejection。
- seed JSON parse + schema validation + zero final labels。
- input immutability。
- strict compile。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub上の `worksheetReviewRouteLabelCorpus.ts` 本体を公開interface互換stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime validation:
  - valid blinded adjudicated corpusを受理。
  - adjudicated label / projection evaluation caseを抽出。
  - `providerChoice / providerConfidence / model / probability` のunknown field混入を4/4 reject。
  - `confidenceHidden=false` をreject。
  - annotationなしadjudicationをreject。
  - adjudicated caseのprojection state欠落をprojection抽出時にreject。
  - pending caseからfinal labelを抽出しない。
- seed fixture:
  - 12 cases。
  - 8種類以上のcase family。
  - annotations = []。
  - adjudicationなし。
  - expected inspect/routineは未付与。
- fixture pathは既存external XLSX testsと同じ `import.meta.url` 基準へ統一。
- 既存 `expectedReview` はroute labelとして流用していない。
- provider output / identity / model / probability / confidenceをlabel schemaへ追加していない。
- live provider / auto label / production routingは追加していない。
- repository dependency treeは現環境に無いためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
