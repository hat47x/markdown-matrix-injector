# Issue: Notation v1 parameter contractをAuthority adapterと共有する

## Meta
- Type: Refactor / Contract hardening
- Status: Done
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

- [x] 12個のknown parameterを共通metadataへ定義する。
- [x] enum / pattern / minLengthを正本schemaと一致させる。
- [x] unknown key / x-* をエラーにしない。
- [x] URLSearchParamsの全occurrenceを検証する。
- [x] validation issueはkey / value / occurrence / reasonをmachine-readableに返す。
- [x] Authority adapterは共通validatorを利用する。
- [x] Authority adapter内の重複parameter switchを削除する。
- [x] JSON Schemaとのsync testを追加する。
- [x] schemaのadditionalProperties=true / x-* patternPropertiesもsync testで固定する。
- [x] production plugin/rendering挙動は変更しない。
- [x] fill telemetry / external-XLSX評価コードは変更しない。

## Validation plan

- parameter contract単体をstrict compileする。
- valid known vocabularyを全件pass。
- 各constraint違反を検出。
- unknown/x-*を許容。
- repeated formatColumnの各occurrenceを検証。
- schema metadata syncを検証。
- adapter sourceからprivate validatorが消え、共通validator importへ置換されたことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- `parameterContract.ts` を `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` でcompile成功。
- focused contract/schema harness: **14 checks pass / 0 fail**。
- 確認内容:
  - 12個のknown parameterのvalid vocabularyを全件pass。
  - enum / pattern / minLength違反を期待どおり検出。
  - unknown key / `x-*` をP5 forward compatibilityとして許容。
  - repeated `formatColumn` の全occurrenceを評価し、2件目のinvalid値を occurrence=1 として検出。
  - TypeScript contractのproperty集合と `params.schema.json` property集合が一致。
  - mode / transpose / pageBreak / orientation enum一致。
  - header / columns / formatColumn pattern一致。
  - grep minLength一致。
  - `additionalProperties=true` と `^x-` patternPropertiesを確認。
- GitHub正本のAuthority adapterを再取得して静的確認:
  - `validateKnownEmbedQueryParameters` をimport。
  - private `validateKnownParameters` 関数は削除済み。
  - legacy parameter switchは残存していない。
- production plugin / renderer semanticsは変更していない。
- fill telemetry / external-XLSX評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
