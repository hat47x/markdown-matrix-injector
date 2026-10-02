# Issue: Phase 10 KPI 再定義 (ADR-0012 D6)

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/phase10_governance_report.py`, `phase10_backlog_escalation.py`, `phase10_evidence_harvest.py`, `phase10_governance_pipeline.py`（各test_*.py含む）, `04_Documentation/phase10-governance-reporting-foundation.md`, `phase10-evidence-auto-harvest.md`, `phase7-release-readiness.md`, `00_Prompt/requirements.md`, `01_Plans/adr/ADR-0009-*.md`, `01_Plans/issues/issue-0087-*.md`, サンプルJSON 2件
- Expected verification level: unit（python unittest）+ planning_queue整合

## Traceability
- Related Backlog/Phase: requirements.md Phase 12（規約仕様化と普及基盤）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md` D6
- Supersedes（一部）: `issue-0087-phase10-backlog-auto-escalation-rule.md` の指標一覧（append-only noteで相互参照）

## 背景
ADR-0012 D6は、採用観測の主要KPIを「閲覧・導入時間」中心の4指標（導入時間 / リンク不整合検知率 / 印刷再現性 /
問い合わせ自己解決率）から、agentic時代でも意味を失わない3指標（駆逐されたコピー重複 / 正本と文書の乖離
インシデント / 表変更のレビュー所要時間）へ差し替えることを決定した。本issueはその実装を担う。

調査の結果、現行4指標も実は自動計測されておらず、`phase10_evidence_harvest.py` の `build_governance_seed()` が
一般的なCIゲートpass/fail統計を `printReproducibilityRate` 等のドメイン固有KPI名で誤ってラベル付けしていた
ことが判明した。新KPIではこの問題を繰り返さないよう、実測値は明示的な手動入力（`--manual-kpis-file`）として扱い、
`kpisProvenance` で「実測」と「未計測のプレースホルダ」を区別する。

## Execution Plan
### Proposed solution（実施済み）
1. `phase10_governance_report.py`: `SCHEMA_VERSION = "phase10-governance-report/v2"` を追加し `schemaVersion` を必須化。
   `REQUIRED_KPI_KEYS` を新3フィールド（`displacedDuplicationCount` / `canonDriftIncidentCount` /
   `tableChangeReviewLeadTimeHours`）に置換。`LEGACY_KPI_KEYS` を検出して明示的にエラーとするguardを追加。
2. `phase10_backlog_escalation.py`: `DEFAULT_THRESHOLDS` と `evaluate_candidates()` を新KPI・正しい極性
   （重複駆逐は下回りで警告、乖離/レビュー時間は上回りで警告）で書き換え。
3. `phase10_evidence_harvest.py`: `build_governance_seed()` に `manual_kpis` パラメータを追加し、`kpisProvenance`
   （`manual` / `unmeasured-default`）を出力に含める。CLIに `--manual-kpis-file` を追加。
4. `phase10_governance_pipeline.py`: `--manual-kpis-file` を `build_governance_seed()` まで貫通させる。
5. ドキュメント（`phase10-governance-reporting-foundation.md` / `phase10-evidence-auto-harvest.md` /
   `phase7-release-readiness.md` §2.5）・要件（`requirements.md` Phase 7/10 §2）・ADR-0009（supersession note）・
   issue-0087（append-only note）を更新し、旧KPI名への言及を「歴史的記録」として残しつつ新定義へ誘導する。
6. サンプルJSON 2件（`phase10-governance-input.sample.json` 更新 / `phase10-manual-kpis.sample.json` 新規）を用意。

### 副次的に発見・修正した既存バグ（スコープ内）
- `phase10_backlog_escalation.py` `main()`: `--thresholds` で読み込んだ値を無視し `DEFAULT_THRESHOLDS` を
  常に使っていた（コミット `8f6eedd` 由来）。`thresholds` を使うよう修正し、回帰テストを追加。
- `test_phase10_backlog_escalation.py`: `run_cli` の重複定義により **IndentationErrorでimport自体が失敗**
  していた（同コミット由来、`npm test` 等どのCIからも実行されず気づかれていなかった）。単一定義へ修正。

### Follow-up Actions（本 issue のスコープ外・別issueへ委譲）
- `phase10_duplication_scan.py`: git diffベースの重複置換検知（`check_phase9_template_sync.py` の行diffパターンを応用）。
- `QueryEvidenceRecord.resolvedContentHash` 拡張 + `phase10_drift_scan.py`: 正本再解決によるハッシュ差分検知。
- `phase10_review_leadtime.py` + issue front-matter `Reviewed-At:` 規約: レビュー完了タイムスタンプの自動収集。
- いずれも、本issueがmanual entry (`--manual-kpis-file`) で確立したデータ契約（3フィールド + provenance）を
  自動収集で埋める後続実装であり、本issueのスコープには含めない。

### Acceptance criteria
- [x] `phase10_governance_report.py` の `REQUIRED_KPI_KEYS` が新3キーに置換され、`render_markdown()` が新3行を出力する。
- [x] `schemaVersion` が必須化され、欠落/不正値/legacyキー混入がそれぞれ明確なエラーメッセージで拒否される。
- [x] `phase10_backlog_escalation.py` の閾値・シグナルが新3指標の正しい極性で判定される（SLA breach判定は不変）。
- [x] `phase10_evidence_harvest.py` が `manual_kpis` / `--manual-kpis-file` を受け付け、`kpisProvenance` を出力する。
- [x] `phase10_governance_pipeline.py` が `--manual-kpis-file` を最後まで貫通させる（成果物11件は不変）。
- [x] ドキュメント・requirements・ADR-0009・issue-0087が新定義を反映し、旧定義は「歴史的記録」として明示される。
- [x] サンプルJSON 2件が更新/新規作成され、実際にCLIを通ることを確認済み。
- [x] 副次的に発見した `--thresholds` 無視バグと `test_phase10_backlog_escalation.py` の構文エラーを修正。
- [x] `python3 01_Plans/tools/planning_queue.py` でorphan issueが0件。

### Validation plan（実績）
```bash
cd 01_Plans/tools
python3 -m unittest test_phase10_governance_report -v      # 7 pass
python3 -m unittest test_phase10_backlog_escalation -v     # 7 pass（構文エラー修正後）
python3 -m unittest test_phase10_evidence_harvest -v       # 9 pass
python3 -m unittest test_phase10_governance_pipeline -v    # 4 pass
python3 -m unittest test_phase10_sla_dashboard test_phase10_auditability_log test_phase10_artifact_manifest -v  # 10 pass（無変更確認）
cd ../..
python3 01_Plans/tools/planning_queue.py                    # orphan 0
```
サンプルJSON経由の実CLIスモークテスト（`phase10-governance-input.sample.json` → レポート生成）も実施済み。
