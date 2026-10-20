# Issue: Phase 10の生成成果物をマニフェストとSHA-256で記録する

この文書は、Phase 10の生成成果物を一覧化して追跡する当時の方針と完了判断を残したIssue記録です。Execution Evidenceには検証コマンドが記載されていますが、実行日時や成否の出力はありません。現行の生成処理やチェックサム検証を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## 当時の実行計画
### Proposed solution (解決策の概要)
- パイプラインの出力ファイルについて、ファイル名・サイズ・SHA-256の値を一覧にまとめるマニフェスト生成CLIを追加する。
- ガバナンスパイプラインの実行後にマニフェストのJSONとMarkdownを自動生成し、週次運用で作成した成果物を追跡しやすくする。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_artifact_manifest.py --output-dir <dir> --output <manifest.json>` でmanifestが生成できる。
- [x] manifest JSONが `path`, `size_bytes`, `sha256` を各ファイルに保持する。
- [x] governance pipelineがmanifest JSON/Markdownを追加出力する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] manifest CLIを実装する。
- [x] governance pipelineへ統合する。
- [x] unit testを追加・更新する。
- [x] 検証コマンドを実行し証跡を記録する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 生成artifactの完全性（改ざん検知・追跡性）を補助するmanifestが未整備。

### Virtual Debate
- Architecture Lead: sha256を持つmanifestは監査時の同一性確認に有効。
- Product/UX Lead: Markdown manifestがあると運用報告に転記しやすい。
- QA/Delivery Lead: pipelineに統合して自動生成しないと運用漏れが発生する。

### Synthesis & Decision
- manifest CLIを独立実装し、pipelineから自動生成する構成とする。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 01_Plans/tools/planning_queue.py`
