# Issue: Source identity contractを共通化する

## Meta
- Type: Refactor / Integrity primitive
- Status: Done
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

- [x] source identity algorithm / representationを定数化する。
- [x] bytes -> identityがdeterministic。
- [x] file -> identityがbytes digestと一致。
- [x] identityにbyteLengthを保持する。
- [x] contained resolve -> identityが既存resolver境界を再利用する。
- [x] workspace外traversal / symlinkを既存 `PathContainmentError` のまま拒否する。
- [x] source変更後は別digestとなる。
- [x] Authority adapterは共通 `readSourceFileIdentity` を使用する。
- [x] Authority adapter内private SHA-256実装を削除する。
- [x] source digest evidence code / Receipt semanticsを変更しない。
- [x] production plugin / Workbook loader / matcher / fill telemetryを変更しない。

## Validation plan

- core module strict compile。
- known bytesのSHA-256をNode crypto直計算と比較。
- temporary fileでbytes/file identity一致。
- contained relative path解決。
- workspace外traversal拒否。
- symlink外部参照拒否。
- file mutationでdigest変化。
- GitHub正本adapterに共通primitive importがありprivate digest関数がないことを確認。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- `sourceIdentity.ts` + existing `pathResolver` contractを
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- temporary real filesを用いたfocused runtime harness: **6/6 pass**。
- 確認内容は次のとおりです。
  - raw bytesからのidentityがdeterministicでNode SHA-256直計算と一致。
  - file identityと同一bytes identityが一致。
  - contained relative sourceを既存resolver経由で解決してidentity生成。
  - workspace外traversalを `PathContainmentError` で拒否。
  - workspace内symlinkからworkspace外real targetへの参照を拒否。
  - file mutation後にdigest / byteLengthが変化。
- 初回test記述にidentity存在確認の逆assertを発見し、実装ではなくtest誤記として修正済み。
- GitHub正本Authority adapterを再取得して確認:
  - `readSourceFileIdentity` をimport。
  - private `digestFile` は削除済み。
  - `createHash` importは残存していない。
  - load前/後source identity確認の2箇所が共通primitiveを利用。
- Receipt evidence code / Authority semanticsは変更していない。
- production plugin / Workbook loader / matcher / fill telemetry / external-XLSX評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
