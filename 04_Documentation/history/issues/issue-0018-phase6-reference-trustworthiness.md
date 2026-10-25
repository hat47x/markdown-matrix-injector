# Issue: Phase 6でリファレンスを運用時の確認に使える資料へ整える

この文書は、Phase 6当時の提案・完了判定・検証履歴を残したIssue記録です。検証履歴にある途中の未完了状態と、冒頭の`Status: Done`（その後の完了判定）は時点を分けて読んでください。現在の文書・実装・動作を新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `04_Documentation/reference.md`（本文のみ）
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`, `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Reference（詳細仕様書）を機能一覧だけで終わらせず、運用時の問い合わせに最初に答えるための資料として使えるようにする。そのため、各機能に制約、問題が起きたときの挙動、関連する設計書やテストへの参照先を追加する。

### 価値指標（Success metric）
- 主要機能ごとに「正常系 / 失敗時 / 制約 / 関連正本」が1セットで揃うこと。
- サポート担当が問い合わせの一次回答をReferenceへのリンクのみで返答できる粒度を満たすこと。

### 受入条件（Acceptance criteria）
- [x] 主要パラメータ群に「正常系挙動」「代表的な失敗ケース」「制約」「関連正本リンク」が記載されること。
- [x] Smart Fallback / 印刷制御 / Diagnostics / Paste&D&Dについて制約が明文化されること。
- [x] `reference.md` 単体で一次回答源として成立し、必要時に関連正本へ遷移できること。
- [x] docs auditで参照リンク切れがないこと（少なくともrepo内リンク）。

### 作業項目（Task breakdown）
- [x] 既存Referenceを機能単位で棚卸しする。
- [x] 各機能に制約と失敗時挙動を追記する。
- [x] 関連設計/issue/testへのリンクを追加する。
- [x] docs auditで相互リンクを検証する。

### 当時の検証計画（Validation plan）
- `rg -n "失敗|制約|関連|正常系" 04_Documentation/reference.md` で追加観点を確認する。
- `rg -n "02_Architecture|01_Plans|03_Implement/test" 04_Documentation/reference.md` で正本導線を確認する。
- `python3 03_Implement/tools/planning_queue.py` でplanning_queueの `issue_orphan` が0であることを確認する。

## Validation evidence (実行証跡)
### Evidence log template
- Run date (UTC): `YYYY-MM-DD`
- Executor: `agent`
- Commands:
  - `python3 03_Implement/tools/planning_queue.py`
  - `rg -n "Validation plan|Status|Done|In Progress|Open" 04_Documentation/history/issues/issue-0016-phase6-adoption-fast-path.md 04_Documentation/history/issues/issue-0017-phase6-scenario-roi-proof.md 04_Documentation/history/issues/issue-0018-phase6-reference-trustworthiness.md`
- Expected:
  - `issue_pending`: `>= 0` (進捗に応じた件数)
  - `issue_orphan`: `0`
  - 対象3Issueの `Validation plan` / `Status` が追跡可能

### 2026-03-28 (UTC) Stream E verification
- Commands:
  - `rg -n "失敗|制約|関連|正常系" 04_Documentation/reference.md`
  - `rg -n "02_Architecture|01_Plans|03_Implement/test" 04_Documentation/reference.md`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - `reference.md` に主要観点（正常系 / 失敗時 / 制約 / 関連正本）が複数セクションで明示されていることを確認。
  - `reference.md` から `01_Plans` / `02_Architecture` / `03_Implement/test` への導線が存在することを確認。
  - planning_queueは `issue_pending: 4`, `issue_orphan: 0` を維持。
- Interpretation:
  - 完了条件「reference単体で一次回答源として成立」を満たす。

### 2026-03-26 (UTC) planning_queue observation
- Command: `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - `issue_pending: 5`
  - `issue_orphan: 0`
- Interpretation:
  - 本IssueはReference本文の信頼性追記が未完のため `In Progress` が妥当。
  - orphan未発生のため、関連ADR参照健全性は維持。
