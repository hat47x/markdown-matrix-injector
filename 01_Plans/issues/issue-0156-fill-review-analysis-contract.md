# Issue: deterministic fill review analysisをevaluation labelから分離する

## Meta
- Type: Refactor / Runtime evidence contract
- Status: Done
- Priority: High
- Scope: label-free deterministic fill review analysis, telemetry evaluator reuse, deterministic evidence input
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Depends on: issue-0154 Done, issue-0155 Done
- Parallel exclusion: matcher / fill feature extraction / production runtime / external-XLSX reader behaviorは変更しない

## Problem

`DeterministicReviewEvidenceV1` は評価用 `WorksheetFormatFillReviewCaseResult` を入力としている。
この型は `expectedReview` を含むため、artifactには保存していなくてもruntime evidence生成経路がevaluation label型へ依存している。

## Execution Plan

- `worksheetFormatFillReviewAnalysis.ts` を追加する。
- `expectedReview` を持たない `WorksheetFormatFillReviewAnalysisResult` を定義する。
- fill telemetry分類とhigh-impact/diagnostic flagsをanalysis層へ移す。
- existing evaluatorはanalysis結果へ `expectedReview` を後付けしmetricsだけ計算する。
- telemetry code typeはanalysis層を正本とし、旧moduleからre-exportして互換性を維持する。
- deterministic review evidenceはanalysis result型だけを受け取る。

## Acceptance criteria

- [x] label-free analysis APIを追加する。
- [x] analysis resultに `expectedReview` が存在しない。
- [x] telemetry code taxonomyを変更しない。
- [x] decisionImpact / essentialUnavailable / broad diagnostics semanticsを変更しない。
- [x] existing evaluation metricsを変更しない。
- [x] telemetry module API互換性を維持する。
- [x] deterministic evidence inputをanalysis resultへ変更する。
- [x] deterministic evidence生成経路で `expectedReview` を要求しない。
- [x] matcher / feature extraction / source profilesを変更しない。
- [x] production runtime / provider / UIを変更しない。

## Validation plan

- analysis単体でdecision-impact / essential-unavailable / diagnostic-onlyを再現。
- analysis result serializationに `expectedReview` がない。
- evaluation wrapperのケース結果には従来どおり `expectedReview` が付与される。
- 同一fixtureでanalysis telemetryとevaluation telemetryが一致する。
- deterministic evidenceをlabel-free analysis resultから生成可能。
- existing telemetry code setを維持。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- 新規 `worksheetFormatFillReviewAnalysis.ts` と既存evaluation wrapperの公開型境界を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **5 tests / 5 pass / 0 fail**。
- 確認内容は次のとおりです。
  - decision-impact `fill-supported-acceptance` をlabel-free analysisで再現。
  - `fill-unavailable` と `fill-unavailable-for-discrimination` を分離。
  - `fill-tone-disagreement` をdiagnostic-only相当の低impactとして維持。
  - evaluation wrapperがanalysis telemetryをそのまま再利用し、`expectedReview`だけを後付け。
  - serialized analysis resultに `expectedReview` が存在しない。
- refactor中に `evaluateWorksheetFormatFillReviewTelemetry` 本体までhelper移動範囲へ巻き込まれて削除されていたことを検出し、analysis wrapperとして復元済み。公開API互換性を維持。
- deterministic evidenceは `WorksheetFormatFillReviewAnalysisResult` を直接受けるよう変更し、evaluation result型への依存を除去。
- deterministic evidence focused testへ、`expectedReview`を持たないanalysis resultから直接evidenceを生成するケースを追加。
- telemetry code taxonomyは新analysis moduleを正本とし、旧telemetry moduleからtype re-exportして既存import互換を維持。
- matcher / threshold / feature extraction / source profile / external-XLSX reader behaviorは変更していない。
- production runtime / provider / UIは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。0156固有のstrict API整合とruntime classification境界をfocusedに検証。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
