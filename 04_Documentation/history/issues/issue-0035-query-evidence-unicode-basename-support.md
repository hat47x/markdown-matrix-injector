# Issue: クエリ証跡の出力ファイル名に日本語などのUnicode文字を残す

この文書は、前段のファイル名正規化をUnicode対応へ拡張した当時の提案と完了状態を残したIssue記録です。前段の英数字中心の規則から変更した内容を記録しており、2026年3月31日の実行証跡は現在の動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0034-query-evidence-filename-sanitization.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 前段のファイル名正規化ではASCIIの英数字だけを残すため、日本語などのUnicode文字を使った文書名が`markdown`に置き換わりやすい。
- 正規化規則をUnicodeの文字クラス（`\p{L}` / `\p{N}`）に対応させる。日本語などの非ASCII文字を残しながら、対象外の記号を`-`に置き換える。
- Unicode文字を含む文書名と、記号が混在する文書名について、単体テストを追加する。

### 受入条件（Acceptance criteria）
- [x] Unicode basename（例: 日本語ファイル名）が保持される。
- [x] 記号混在時も既存のハイフン正規化ルールは維持される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] サニタイズ正規表現をUnicode対応へ更新する。
- [x] unit testを追加する。
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
  - basenameサニタイズをUnicode文字クラス対応へ更新。
  - 日本語basename保持ケースおよび記号正規化ケースをテスト追加。
  - 全116テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
