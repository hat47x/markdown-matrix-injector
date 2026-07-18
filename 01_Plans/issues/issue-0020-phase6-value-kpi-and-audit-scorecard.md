# Issue: Phase 6 Value KPI and Audit Scorecard（価値指標の計測テンプレート化）

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/`, `04_Documentation/README.md`, `02_Architecture/phase6-public-documentation-architecture.md`
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Phase 6 の KPI（TFS、Decision Readiness、Support Deflection、Feedback Closure）を issue 運用で毎回計測できるよう、scorecard テンプレートを新設する。
- KPI 計測は Gate C の docs audit 結果を入力に Gate D で記録し、Gate E の `planning_queue.py` 実行で運用追跡可能性を確認する。
- 運用順序は `Overview -> Tutorial -> Scenario -> Reference` 導線監査を起点に固定し、issue-0019 の feedback loop 手順と矛盾させない。

### Acceptance criteria (受入条件)
- [x] KPI 4項目を計測する Markdown テンプレートが追加されること。
- [x] scorecard に「測定日」「対象文書」「判定」「次アクション」「反映先リンク」が含まれ、Gate D の記録要件と一致すること。
- [x] issue-0016〜0019 の成果を scorecard で1回以上評価できる状態になること。
- [x] planning_queue 実行時に関連ADR欠落が発生せず、orphan / pending の可視性が維持されること。

### Task breakdown (作業分解)
- [x] KPIの定義と判定基準を `01_Plans/templates/phase6-kpi-scorecard.md` に固定する。
- [x] scorecard サンプル（`01_Plans/templates/phase6-kpi-scorecard-sample.md`）との接続を明文化する。
- [x] 反映先リンク欄（requirements / architecture / tests / issue）を architecture / README / issue 導線で統合する。
- [x] triageコマンド（`python3 01_Plans/tools/planning_queue.py`）で運用可能性を検証する。

### Validation plan (検証計画)
- `rg -n "Overview|Tutorial|Scenario|Reference" 04_Documentation/README.md` で共通導線を確認する。
- `rg -n "Gate A|Gate B|Gate C|Gate D|Gate E|docs audit|feedback loop|scorecard|TFS|Decision Readiness|Support Deflection|Feedback Closure|planning_queue" 02_Architecture/phase6-public-documentation-architecture.md 01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md 01_Plans/issues/issue-0020-phase6-value-kpi-and-audit-scorecard.md` で KPI / 監査運用の接続を確認する。
- `python3 01_Plans/tools/planning_queue.py` で orphan / pending 可視性を確認する。

## Execution Evidence (2026-03-28)
- Task 1: KPI 4項目（TFS / Decision Readiness / Support Deflection / Feedback Closure）が `01_Plans/templates/phase6-kpi-scorecard.md` に固定されていることを `rg` で確認。
- Task 2: 「測定日 / 対象文書 / 判定 / 次アクション / 反映先リンク」の必須欄がテンプレート本体と必須入力チェックに存在することを `rg` で確認。
- Task 3: `01_Plans/templates/phase6-kpi-scorecard-sample.md` に issue-0016〜0019 を 1 回で横断評価するサンプル記載があることを `rg` で確認。
- Task 4: `python3 01_Plans/tools/planning_queue.py` 実行結果で `issue_orphan: 0` / `adr_pending: 0` を確認。
- Task 5: 本節を追加し、検証証跡を issue-0020 に追記。

### Verification log
```bash
rg -n "TFS|Decision Readiness|Support Deflection|Feedback Closure|測定日|対象文書|次アクション|反映先" 01_Plans/templates/phase6-kpi-scorecard*.md
python3 01_Plans/tools/planning_queue.py
```
