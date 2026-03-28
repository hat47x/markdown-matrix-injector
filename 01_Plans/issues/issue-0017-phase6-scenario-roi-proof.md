# Issue: Phase 6 Scenario ROI Proof（活用シナリオの意思決定証拠強化）

## Meta
- Type: Docs
- Status: In Progress
- Priority: High
- Scope: `04_Documentation/scenario-sier-design-docs.md`（Scenario本文のみ）
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`, `02_Architecture/phase6-public-documentation-architecture.md`

## Execution Plan
### Proposed solution (解決策の概要)
- SIer向けシナリオに、従来運用との差分（レビュー準備工数、別紙参照時の可読性、印刷制御の再現性）を観測可能な形で追加し、導入可否判断に使える証拠を整備する。

### Success metric (価値指標)
- 利用前/利用後比較の評価軸が最低3つ明記され、各軸に観測方法が紐づくこと。
- シナリオ文書単体で「適用条件」「期待効果」「適用しない方がよい条件」が判断できること。

### Acceptance criteria (受入条件)
- [x] Scenario本文に「利用前/利用後」の比較観点が最低3項目記載されること。
- [x] 各観点に対応する操作手順・期待結果・制約がセットで記載されること。
- [x] 適用条件 / 非推奨条件と比較観点のみで、導入可否を本文単体で判断できること。
- [ ] 文書化で発見した product gap があれば、別issueとして起票されること。

### Task breakdown (作業分解)
- [x] ROI観点（時間短縮・品質・監査容易性）を選定する。
- [x] Scenario guide に比較表と観測手順を追記する。
- [x] Scenario本文のみで比較証拠が完結する構成へ整える。
- [ ] 発見ギャップを issue 化しトレースを残す。

### Validation plan (検証計画)
- `rg -n "利用前|利用後|比較|ROI|工数|期待結果|適用条件" 04_Documentation/scenario-sier-design-docs.md` で比較証拠の存在を確認する。
- `rg -n "samples/" 04_Documentation/scenario-sier-design-docs.md` でサンプル導線を確認する。
- `python3 01_Plans/tools/planning_queue.py` で起票漏れや orphan がないことを確認する。
- `rg -n "Validation plan|Status|Done|In Progress|Open" 01_Plans/issues/issue-0016-phase6-adoption-fast-path.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md` で3Issue横断の運用整合を確認する。

## Validation evidence (実行証跡)
### Evidence log template
- Run date (UTC): `YYYY-MM-DD`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/planning_queue.py`
  - `rg -n "Validation plan|Status|Done|In Progress|Open" 01_Plans/issues/issue-0016-phase6-adoption-fast-path.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
- Expected:
  - `issue_pending`: `>= 0` (進捗に応じた件数)
  - `issue_orphan`: `0`
  - 対象3Issueの `Validation plan` / `Status` が追跡可能

### 2026-03-26 (UTC) planning_queue observation
- Command: `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `issue_pending: 5`
  - `issue_orphan: 0`
- Interpretation:
  - 本IssueはROI観測証拠の本文追記が未完のため `In Progress` が妥当。
  - orphan 未発生のため、起票・参照の追跡性は維持。

### 2026-03-28 (UTC) Stream C execution evidence
- Run date (UTC): `2026-03-28`
- Executor: `agent`
- Commands:
  - `rg -n "利用前|利用後|比較|ROI|工数|期待結果|適用条件" 04_Documentation/scenario-sier-design-docs.md`
  - `rg -n "samples/" 04_Documentation/scenario-sier-design-docs.md`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - Scenario本文に「利用前/利用後」「ROI」「工数」「期待結果」「適用条件」を含む比較証拠が存在することを確認。
  - `samples/` 参照が Scenario本文から除去され、本文単体判断に寄せたことを確認。
  - `planning_queue.py` 実行で `issue_pending: 5` / `issue_orphan: 0` を確認。
- Interpretation:
  - 受入条件を Scenario本文スコープへ固定した運用で、比較証拠の自立性を満たす方向に進捗。

### 2026-03-28 (UTC) Stream D: samples 側エビデンス追記
- Scope:
  - `04_Documentation/samples/phase6-roi/README.md`
  - `04_Documentation/samples/phase6-roi/before-state.md`
  - `04_Documentation/samples/phase6-roi/after-state.md`
  - `04_Documentation/samples/phase6-roi/observation-protocol.md`
  - `04_Documentation/samples/phase6-roi/roi-metrics-template.csv`
- Command: `rg -n "前提|手順|期待結果|制約" 04_Documentation/samples/phase6-roi/*.md`
- Result summary:
  - 4 文書すべてで `前提 / 手順 / 期待結果 / 制約` 見出しを確認。
  - `samples` 配下のみで再現導線（README → before/after → protocol → csv）が成立。
- Command: `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `issue_pending: 5`
  - `issue_orphan: 0`
- Interpretation:
  - issue-0017 のうち「samples導線固定」「前提/操作手順/期待結果の統一」「アンカー命名整備」のサンプル側作業は完了。
  - Scenario 本文側の比較記述完了までは、Status `In Progress` を維持する。

