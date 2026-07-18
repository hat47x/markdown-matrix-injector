# Issue: Phase 10 artifact manifest and checksum

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## Execution Plan
### Proposed solution (解決策の概要)
- pipeline 出力物に対し、ファイル名・サイズ・sha256 を列挙する manifest CLI を追加する。
- governance pipeline 実行後に manifest JSON/Markdown を自動生成し、週次運用成果物の追跡性を強化する。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_artifact_manifest.py --output-dir <dir> --output <manifest.json>` でmanifestが生成できる。
- [x] manifest JSON が `path`, `size_bytes`, `sha256` を各ファイルに保持する。
- [x] governance pipeline が manifest JSON/Markdown を追加出力する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] manifest CLIを実装する。
- [x] governance pipelineへ統合する。
- [x] unit testを追加・更新する。
- [x] 検証コマンドを実行し証跡を記録する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 生成artifactの完全性（改ざん検知・追跡性）を補助するmanifestが未整備。

### Virtual Debate
- Architecture Lead: sha256を持つmanifestは監査時の同一性確認に有効。
- Product/UX Lead: Markdown manifestがあると運用報告に転記しやすい。
- QA/Delivery Lead: pipeline に統合して自動生成しないと運用漏れが発生する。

### Synthesis & Decision
- manifest CLIを独立実装し、pipelineから自動生成する構成とする。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 01_Plans/tools/planning_queue.py`
