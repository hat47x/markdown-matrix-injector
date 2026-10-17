# Issue: Phase 6の価値指標を記録するスコアカードを整える

この文書は、Phase 6当時のKPI計測方針と完了状態を残したIssue記録です。以下の検証コマンドと実行証跡は当時の確認内容であり、現在も同じ計測結果が得られると新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/`, `04_Documentation/README.md`, `02_Architecture/phase6-public-documentation-architecture.md`
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Phase 6の4つの価値指標（TFS、Decision Readiness、Support Deflection、Feedback Closure）を、Issueの運用時に毎回計測・記録できるよう、scorecardテンプレートを新設する。
- KPI計測はGate Cのdocs audit結果を入力にGate Dで記録し、Gate Eの `planning_queue.py` 実行で運用追跡可能性を確認する。
- 運用順序は `Overview -> Tutorial -> Scenario -> Reference` 導線監査を起点に固定し、issue-0019のfeedback loop手順と矛盾させない。

### 受入条件（Acceptance criteria）
- [x] KPI 4項目を計測するMarkdownテンプレートが追加されること。
- [x] scorecardに「測定日」「対象文書」「判定」「次アクション」「反映先リンク」が含まれ、Gate Dの記録要件と一致すること。
- [x] issue-0016〜0019の成果をscorecardで1回以上評価できる状態になること。
- [x] planning_queue実行時に関連ADR欠落が発生せず、orphan / pendingの可視性が維持されること。

### 作業項目（Task breakdown）
- [x] KPIの定義と判定基準を `01_Plans/templates/phase6-kpi-scorecard.md` に固定する。
- [x] scorecardサンプル（`01_Plans/templates/phase6-kpi-scorecard-sample.md`）との接続を明文化する。
- [x] 反映先リンク欄（requirements / architecture / tests / issue）をarchitecture / README / issue導線で統合する。
- [x] triageコマンド（`python3 01_Plans/tools/planning_queue.py`）で運用可能性を検証する。

### 当時の検証計画（Validation plan）
- `rg -n "Overview|Tutorial|Scenario|Reference" 04_Documentation/README.md` で共通導線を確認する。
- `rg -n "Gate A|Gate B|Gate C|Gate D|Gate E|docs audit|feedback loop|scorecard|TFS|Decision Readiness|Support Deflection|Feedback Closure|planning_queue" 02_Architecture/phase6-public-documentation-architecture.md 01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md 01_Plans/issues/issue-0020-phase6-value-kpi-and-audit-scorecard.md` でKPI / 監査運用の接続を確認する。
- `python3 01_Plans/tools/planning_queue.py` でorphan / pending可視性を確認する。

## Execution Evidence (2026-03-28)
- Task 1: KPI 4項目（TFS / Decision Readiness / Support Deflection / Feedback Closure）が `01_Plans/templates/phase6-kpi-scorecard.md` に固定されていることを `rg` で確認。
- Task 2: 「測定日 / 対象文書 / 判定 / 次アクション / 反映先リンク」の必須欄がテンプレート本体と必須入力チェックに存在することを `rg` で確認。
- Task 3: `01_Plans/templates/phase6-kpi-scorecard-sample.md` にissue-0016〜0019を1回で横断評価するサンプル記載があることを `rg` で確認。
- Task 4: `python3 01_Plans/tools/planning_queue.py` 実行結果で `issue_orphan: 0` / `adr_pending: 0` を確認。
- Task 5: 本節を追加し、検証証跡をissue-0020に追記。

### Verification log
```bash
rg -n "TFS|Decision Readiness|Support Deflection|Feedback Closure|測定日|対象文書|次アクション|反映先" 01_Plans/templates/phase6-kpi-scorecard*.md
python3 01_Plans/tools/planning_queue.py
```
