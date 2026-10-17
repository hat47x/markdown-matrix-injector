# Issue: CI・手動実行でKPI集計CSVを成果物に含める

この文書は、Phase 7当時のCIと手動ワークフローにおける成果物アップロード設定の修正と完了判断を残したIssue記録です。CSVを生成できることと、アップロード対象に含めることは別の処理です。2026年4月2日の検証証跡を、現在のCIでのアップロード成功として扱うものではありません。

## Meta
- Type: Bugfix
- Status: Done
- Priority: High
- Scope: `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 当時はKPI集計用のCSV（metrics CSV）を生成していても、成果物（artifact）のアップロード対象には含まれていなかった。そこで、CIと手動実行のワークフローのアップロード対象パスに`artifacts/release-gate-metrics.csv`を追加する。

### 受入条件（Acceptance criteria）
- [x] `ci.yml` のrelease-gate artifact pathにmetrics CSVが含まれる。
- [x] `release-gate-manual.yml` のartifact pathにmetrics CSVが含まれる。
- [x] ローカル検証コマンドが継続して成功する。

### 作業項目（Task breakdown）
- [x] CI workflowのupload pathを修正する。
- [x] manual workflowのupload pathを修正する。
- [x] 検証コマンドを実行し証跡を記録する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm run release:gate:full`
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - CI/manual workflowのartifact uploadにmetrics CSVを追加。
  - release-gate fullとユニットテストの成功を確認。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
