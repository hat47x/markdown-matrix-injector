# Issue: 長いクエリ証跡ファイル名をハッシュで区別できることをテストする

この文書は、長い文書名が似ている場合のファイル名の区別を、当時の単体テストで確認したIssue記録です。実装コードの変更ではなく回帰防止テストの追加を対象とし、2026年3月31日の実行証跡を現行テストの再実行とみなすものではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0037-query-evidence-basename-hash-suffix.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 長い文書名（basename）の先頭57文字が同じでも、ハッシュ接尾辞（hash suffix）によって異なる出力ファイル名になることを単体テストで確認する。
- 実装コードは変更せず、後の修正でこの区別が失われないようにテストを強化する。

### 受入条件（Acceptance criteria）
- [x] 先頭57文字が同一でもhash suffixでファイル名が異なることを検証するテストがある。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] 衝突回避テストを追加する。
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
  - 先頭57文字が同一な長文basename 2件で、hash suffixによりcsv出力名が分岐するテストを追加。
  - 正規表現で `-<hex6>` 形式を検証し、衝突回避ルールを固定。
  - 全118テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
