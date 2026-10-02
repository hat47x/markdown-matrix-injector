# Issue: Phase 9 test coverage and pattern governance requirement update

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `00_Prompt/requirements.md`, `01_Plans/adr/`, `01_Plans/issues/`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- ユーザー要望に従い、Phase 9要件へ「テストカバレッジ向上」と「テストパターン拡充」を明示的に追加する。
- 併せてADR-0008にcoverage/pattern governanceを追記し、決定と要件の整合性を確保する。

### Acceptance criteria (受入条件)
- [x] `00_Prompt/requirements.md` のPhase 9にcoverage upliftとpattern expansionの要件が追加される。
- [x] `ADR-0008` にcoverage/pattern governanceの決定が反映される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] requirementsを更新する。
- [x] ADRを更新する。
- [x] planning queueを再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
