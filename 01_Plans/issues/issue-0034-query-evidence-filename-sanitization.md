# Issue: クエリ証跡の出力ファイル名を扱いやすい形に整える

この文書は、当時の出力ファイル名の正規化に関する提案と完了状態を残したIssue記録です。ここに記載された英数字中心の規則は、この段階の設計です。後続IssueでのUnicode対応と混同せず、2026年3月29日の実行証跡を現在の動作確認として扱わないでください。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0032-query-evidence-output-path-helper.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 元のMarkdown文書名（basename）をそのまま出力ファイル名に使うと、空白や記号によって扱いにくくなる場合がある。このため、`buildQueryEvidenceOutputPaths`で文書名を正規化する。
- 当時の正規化規則では、英数字と`-`・`_`以外の文字を`-`へ置き換える。続く`-`は一つにまとめ、先頭・末尾の`-`は取り除く。結果が空文字になった場合は`markdown`を使う。
- 既存のテストを維持しながら、ファイル名の正規化を確かめる単体テストを追加する。

### 受入条件（Acceptance criteria）
- [x] 出力ファイル名が安全なbasenameへ正規化される。
- [x] basenameが空になるケースで `markdown` にフォールバックする。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `vscodeAdapters.ts` にbasenameサニタイズ処理を追加する。
- [x] `queryEvidence.test.ts` にサニタイズケースを追加する。
- [x] `npm test` を実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - basenameサニタイズ（記号置換・連続ハイフン圧縮・先頭末尾トリム）を追加。
  - 空文字化時の `markdown` フォールバックを追加。
  - サニタイズ/フォールバックのunit testを追加し、全114テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
