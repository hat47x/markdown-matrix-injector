# Issue: クエリ証跡の長い出力ファイル名に識別用ハッシュを付ける

この文書は、出力ファイル名を64文字に収める際の衝突回避策について、当時の提案と完了状態を残したIssue記録です。記載されたテスト結果は2026年3月31日の実行証跡であり、現在の実装を新たに検証したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0036-query-evidence-basename-length-cap.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 出力ファイル名を64文字で単純に切り詰めると、よく似た長い文書名が同じ名前になる場合がある。このため、切り詰めが必要なときは末尾に短いハッシュ値を付けて区別する。
- 当時の方針では、`sha1(normalized).slice(0,6)`で得る値を接尾辞（suffix）とし、`<prefix>-<hash>`の形式で全体を64文字以内に収める。
- 文書名が64文字以内の場合は、既存のbasenameをそのまま維持する。

### 受入条件（Acceptance criteria）
- [x] 切り詰めが必要なbasenameにハッシュ接尾辞が付与される。
- [x] 64文字以下のbasenameは従来どおり保持される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] basename正規化ロジックにハッシュ接尾辞を追加する。
- [x] unit testを更新/追加する。
- [x] `npm test` を実行する。

### 当時の検証計画（Validation plan）
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
