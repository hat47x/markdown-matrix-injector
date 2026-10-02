# Issue: Phase 7 release gate markdown report export

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_check.py`, `01_Plans/tools/test_release_gate_check.py`, `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- JSON証跡に加えてMarkdownレポートを出力し、PRレビュー時に人間が読みやすいrelease gate結果を残す。

### Acceptance criteria (受入条件)
- [x] `release_gate_check.py` に `--output-markdown-file` が追加される。
- [x] Markdown report生成ロジックのテストが追加される。
- [x] CI artifactとして `artifacts/release-gate.md` が保存される。
- [x] Phase 7ガイドにMarkdown出力運用が追記される。

### Task breakdown (作業分解)
- [x] release gate CLIにMarkdown report生成を追加する。
- [x] unittestを更新する。
- [x] CI workflowのartifact収集対象を拡張する。
- [x] ドキュメントへ運用手順を反映する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json --output-markdown-file artifacts/release-gate.md`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json --output-markdown-file artifacts/release-gate.md`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate CLIがJSON + Markdownの二系統証跡を出力可能になった。
  - CI workflowが `release-gate.json` / `release-gate.md` をartifactとして保存するようになった。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
