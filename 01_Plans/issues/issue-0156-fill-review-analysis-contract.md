# Issue: deterministic fill review analysisをevaluation labelから分離する

## Meta
- Type: Refactor / Runtime evidence contract
- Status: Open
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

- [ ] label-free analysis APIを追加する。
- [ ] analysis resultに `expectedReview` が存在しない。
- [ ] telemetry code taxonomyを変更しない。
- [ ] decisionImpact / essentialUnavailable / broad diagnostics semanticsを変更しない。
- [ ] existing evaluation metricsを変更しない。
- [ ] telemetry module API互換性を維持する。
- [ ] deterministic evidence inputをanalysis resultへ変更する。
- [ ] deterministic evidence生成経路で `expectedReview` を要求しない。
- [ ] matcher / feature extraction / source profilesを変更しない。
- [ ] production runtime / provider / UIを変更しない。

## Validation plan

- analysis単体でdecision-impact / essential-unavailable / diagnostic-onlyを再現。
- analysis result serializationに `expectedReview` がない。
- evaluation wrapperのケース結果には従来どおり `expectedReview` が付与される。
- 同一fixtureでanalysis telemetryとevaluation telemetryが一致する。
- deterministic evidenceをlabel-free analysis resultから生成可能。
- existing telemetry code setを維持。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
