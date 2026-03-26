# Issue: Phase 6 Reference Trustworthiness（詳細仕様の信頼性強化）

## Meta
- Type: Docs
- Status: In Progress
- Priority: Medium
- Scope: `04_Documentation/reference.md`, `02_Architecture/phase6-public-documentation-architecture.md`
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
- [ ] 主要パラメータ群に「正常系挙動」「代表的な失敗ケース」「関連正本リンク」が記載されること。
- [ ] Smart Fallback / 印刷制御 / Diagnostics / Paste&D&D について制約が明文化されること。
- [ ] `phase6-public-documentation-architecture.md` の quality gate と矛盾しないこと。
- [ ] docs audit で参照リンク切れがないこと（少なくとも repo 内リンク）。

### Task breakdown (作業分解)
- [ ] 既存Referenceを機能単位で棚卸しする。
- [ ] 各機能に制約と失敗時挙動を追記する。
- [ ] 関連設計/issue/test へのリンクを追加する。
- [ ] docs audit で相互リンクを検証する。

### Validation plan (検証計画)
- `rg -n "失敗|制約|関連|正常系" 04_Documentation/reference.md` で追加観点を確認する。
- `rg -n "02_Architecture|01_Plans|03_Implement/test" 04_Documentation/reference.md` で正本導線を確認する。
- `rg -n "Quality gate|Known limitations" 02_Architecture/phase6-public-documentation-architecture.md 04_Documentation/reference.md` で整合性を確認する。
- `python3 01_Plans/tools/planning_queue.py` で planning_queue の `issue_orphan` が 0 であることを確認する。
- `rg -n "Validation plan|Status|Done|In Progress|Open" 01_Plans/issues/issue-0016-phase6-adoption-fast-path.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md` で3Issueの運用表記を確認する。

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

### 2026-03-26 (UTC) planning_queue observation
- Command: `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `issue_pending: 5`
  - `issue_orphan: 0`
- Interpretation:
  - 本IssueはReference本文の信頼性追記が未完のため `In Progress` が妥当。
  - orphan 未発生のため、関連 ADR 参照健全性は維持。
