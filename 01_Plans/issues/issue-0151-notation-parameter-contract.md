# Issue: Notation v1 parameter contractをAuthority adapterと共有する

## Meta
- Type: Refactor / Contract hardening
- Status: Open
- Priority: High
- Scope: known query parameter validation, params.schema.json sync, Authority adapter reuse
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related Spec: 04_Documentation/spec/params.schema.json
- Depends on: issue-0145 Done, issue-0150 Done
- Parallel exclusion: plugin rendering semantics、fill telemetry、external-XLSX評価は変更しない

## Problem

issue-0145のAuthority adapterはNotation v1既知parameterをローカルswitchで検証している。
一方、正本のmachine-readable contractは `04_Documentation/spec/params.schema.json` にある。

この二重定義は、将来parameter追加・enum/pattern変更時にAuthority validationだけが古くなるdrift要因となる。

## Execution Plan

- `src/parser/parameterContract.ts` にknown parameter contract metadataとvalidatorを追加する。
- contract metadataは正本JSON Schemaの:
  - property name
  - enum
  - pattern
  - minLength
  を表現する。
- unknown keyはP5 forward compatibilityどおり許容する。
- `formatColumn` の繰返し値を含め、URLSearchParamsの全occurrenceを検証する。
- Authority adapterは共通validatorを利用し、private switchを削除する。
- sync testで `params.schema.json` とTypeScript metadataの一致を検証する。

## Acceptance criteria

- [ ] 12個のknown parameterを共通metadataへ定義する。
- [ ] enum / pattern / minLengthを正本schemaと一致させる。
- [ ] unknown key / x-* をエラーにしない。
- [ ] URLSearchParamsの全occurrenceを検証する。
- [ ] validation issueはkey / value / occurrence / reasonをmachine-readableに返す。
- [ ] Authority adapterは共通validatorを利用する。
- [ ] Authority adapter内の重複parameter switchを削除する。
- [ ] JSON Schemaとのsync testを追加する。
- [ ] schemaのadditionalProperties=true / x-* patternPropertiesもsync testで固定する。
- [ ] production plugin/rendering挙動は変更しない。
- [ ] fill telemetry / external-XLSX評価コードは変更しない。

## Validation plan

- parameter contract単体をstrict compileする。
- valid known vocabularyを全件pass。
- 各constraint違反を検出。
- unknown/x-*を許容。
- repeated formatColumnの各occurrenceを検証。
- schema metadata syncを検証。
- adapter sourceからprivate validatorが消え、共通validator importへ置換されたことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
