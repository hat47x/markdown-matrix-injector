# Issue: Source identity contractを共通化する

## Meta
- Type: Refactor / Integrity primitive
- Status: Open
- Priority: High
- Scope: SHA-256 source identity, contained source resolution, Authority adapter reuse
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0145 Done, issue-0150 Done
- Parallel exclusion: production Workbook loader / plugin / fill telemetry / external-XLSX評価は変更しない

## Problem

Authority adapterはsource file bytesのSHA-256をprivate `digestFile` で計算している。
一方、Cognitive Observation側の `sourceDigest` は呼出側が任意文字列として渡せる。

将来、認知側とAuthority側でdigest生成規則が分岐しないよう、source identityを共通primitiveとして先に固定する。

## Execution Plan

- `src/core/sourceIdentity.ts` を追加する。
- canonical representationを `source-file-bytes-v1` とする。
- SHA-256 digest表記を `sha256:<lowercase hex>` に固定する。
- bytesからのidentity生成と、absolute file pathからのidentity生成を提供する。
- `resolveContainedSourceIdentity` は既存 `resolveSourcePath` を必ず通す。
- Authority adapterはprivate digest実装を削除して共通primitiveを利用する。

## Acceptance criteria

- [ ] source identity algorithm / representationを定数化する。
- [ ] bytes -> identityがdeterministic。
- [ ] file -> identityがbytes digestと一致。
- [ ] identityにbyteLengthを保持する。
- [ ] contained resolve -> identityが既存resolver境界を再利用する。
- [ ] workspace外traversal / symlinkを既存 `PathContainmentError` のまま拒否する。
- [ ] source変更後は別digestとなる。
- [ ] Authority adapterは共通 `readSourceFileIdentity` を使用する。
- [ ] Authority adapter内private SHA-256実装を削除する。
- [ ] source digest evidence code / Receipt semanticsを変更しない。
- [ ] production plugin / Workbook loader / matcher / fill telemetryを変更しない。

## Validation plan

- core module strict compile。
- known bytesのSHA-256をNode crypto直計算と比較。
- temporary fileでbytes/file identity一致。
- contained relative path解決。
- workspace外 traversal拒否。
- symlink外部参照拒否。
- file mutationでdigest変化。
- GitHub正本adapterに共通primitive importがありprivate digest関数がないことを確認。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
