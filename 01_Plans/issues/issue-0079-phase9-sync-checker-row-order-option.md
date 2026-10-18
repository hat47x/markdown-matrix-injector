# Issue: Phase 9の同期検査に行順序を無視するオプションを追加する

この文書は、Phase 9の同期検査における行順序の扱いを整理した当時のIssue記録です。2026年4月6日の検証結果は当時の実行証跡であり、現行実装を新たに検証したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 同期検査（sync checker）に`--ignore-row-order`を追加し、行の内容が一致していれば並び順の違いを許容する検証モードを用意する。
- 標準動作では従来どおり行順序を厳格に比較し、後方互換性を維持する。順序を無視するのは、利用者がオプションを指定した場合だけとする。

### 受入条件（Acceptance criteria）
- [x] `check_phase9_template_sync.py` が `--ignore-row-order` を受け取る。
- [x] row mismatch判定がオプション時は順序非依存で評価される。
- [x] `test_check_phase9_template_sync.py` に順序差分許容のテストが追加される。
- [x] `phase9-rule-table-template-operations.md` にオプション利用手順が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] checkerとテストを更新する。
- [x] 運用ガイドを更新する。
- [x] planning queueを再実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（16 tests, all passed）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
