# Issue: Phase 6 Reference Trustworthiness（詳細仕様の信頼性強化）

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `04_Documentation/reference.md`（本文のみ）
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`, `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Reference を「機能一覧」から「運用時の一次回答源」へ引き上げるため、各機能に制約・失敗時挙動・関連設計/テスト導線を追加する。

### Success metric (価値指標)
- 主要機能ごとに「正常系 / 失敗時 / 制約 / 関連正本」が1セットで揃うこと。
- サポート担当が問い合わせの一次回答を Reference へのリンクのみで返答できる粒度を満たすこと。

### Acceptance criteria (受入条件)
- [x] 主要パラメータ群に「正常系挙動」「代表的な失敗ケース」「制約」「関連正本リンク」が記載されること。
- [x] Smart Fallback / 印刷制御 / Diagnostics / Paste&D&D について制約が明文化されること。
- [x] `reference.md` 単体で一次回答源として成立し、必要時に関連正本へ遷移できること。
- [x] docs audit で参照リンク切れがないこと（少なくとも repo 内リンク）。

### Task breakdown (作業分解)
- [x] 既存Referenceを機能単位で棚卸しする。
- [x] 各機能に制約と失敗時挙動を追記する。
- [x] 関連設計/issue/test へのリンクを追加する。
- [x] docs audit で相互リンクを検証する。

### Validation plan (検証計画)
- `rg -n "失敗|制約|関連|正常系" 04_Documentation/reference.md` で追加観点を確認する。
- `rg -n "02_Architecture|01_Plans|03_Implement/test" 04_Documentation/reference.md` で正本導線を確認する。
- `python3 01_Plans/tools/planning_queue.py` で planning_queue の `issue_orphan` が 0 であることを確認する。

## Validation evidence (実行証跡)
### Evidence log template
- Run date (UTC): `YYYY-MM-DD`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/planning_queue.py`
  - `rg -n "Validation plan|Status|Done|In Progress|Open" 01_Plans/issues/issue-0016-phase6-adoption-fast-path.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
- Expected:
  - `issue_pending`: `>= 0` (進捗に応じた件数)
  - `issue_orphan`: `0`
  - 対象3Issueの `Validation plan` / `Status` が追跡可能

### 2026-03-28 (UTC) Stream E verification
- Commands:
  - `rg -n "失敗|制約|関連|正常系" 04_Documentation/reference.md`
  - `rg -n "02_Architecture|01_Plans|03_Implement/test" 04_Documentation/reference.md`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `reference.md` に主要観点（正常系 / 失敗時 / 制約 / 関連正本）が複数セクションで明示されていることを確認。
  - `reference.md` から `01_Plans` / `02_Architecture` / `03_Implement/test` への導線が存在することを確認。
  - planning_queue は `issue_pending: 4`, `issue_orphan: 0` を維持。
- Interpretation:
  - 完了条件「reference 単体で一次回答源として成立」を満たす。

### 2026-03-26 (UTC) planning_queue observation
- Command: `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `issue_pending: 5`
  - `issue_orphan: 0`
- Interpretation:
  - 本IssueはReference本文の信頼性追記が未完のため `In Progress` が妥当。
  - orphan 未発生のため、関連 ADR 参照健全性は維持。
