# Issue: Query Evidence basename 切り詰め時に衝突回避ハッシュを付与

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0036-query-evidence-basename-length-cap.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 64文字上限で単純切り詰めすると類似長文basenameが衝突する可能性があるため、切り詰め時に短いハッシュ接尾辞を付与する。
- 方針: `sha1(normalized).slice(0,6)` をsuffixとし、`<prefix>-<hash>` 形式で64文字に収める。
- 単純ケース（64文字以下）は既存のbasenameを維持する。

### Acceptance criteria (受入条件)
- [x] 切り詰めが必要なbasenameにハッシュ接尾辞が付与される。
- [x] 64文字以下のbasenameは従来どおり保持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] basename正規化ロジックにハッシュ接尾辞を追加する。
- [x] unit testを更新/追加する。
- [x] `npm test` を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - 長さ超過basenameで `-<sha1(6桁)>` を付与するルールを追加。
  - 64文字以内basenameは変更しない互換挙動を維持。
  - 対応テストを更新し、全117テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
