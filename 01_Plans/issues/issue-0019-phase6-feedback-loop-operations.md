# Issue: Phase 6 Feedback Loop Operations（docs audit 定常運用化）

## Meta
- Type: Docs
- Status: Open
- Priority: Medium
- Scope: `01_Plans/`, `02_Architecture/phase6-public-documentation-architecture.md`, `04_Documentation/README.md`
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`, `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- docs audit を単発作業から定常プロセスへ移行し、各イテレーションで発見事項を requirements / architecture / test / issue へ確実に還流する運用テンプレートを整備する。

### Success metric (価値指標)
- docs audit 結果の分類漏れ（未分類項目）が 0 件であること。
- docs更新コミットごとに、上流反映先へのリンクが追跡できること。

### Acceptance criteria (受入条件)
- [ ] docs audit の実施タイミング・入力・出力・完了条件が明文化されること。
- [ ] フィードバック分類（requirements / architecture / test / product gap）が運用手順に組み込まれること。
- [ ] 少なくとも1回分の audit 記録テンプレート（またはサンプル）が追加されること。
- [ ] planning_queue で orphan / pending 判定が追跡可能な状態を維持すること。

### Task breakdown (作業分解)
- [x] docs audit の運用フローを、`02_Architecture/phase6-public-documentation-architecture.md` と `04_Documentation/README.md` の共通導線（Overview -> Tutorial -> Scenario -> Reference）に揃える。
- [x] 反映先ごとの分類テンプレート（`01_Plans/templates/docs-feedback-classification-template.md`）との接続を明文化する。
- [x] audit結果の記録様式（`01_Plans/templates/docs-audit-feedback-loop-template.md` / `01_Plans/templates/docs-audit-log-template.md`）への導線を明文化する。
- [x] triageコマンド（`python3 01_Plans/tools/planning_queue.py`）で orphan / pending 可視性を維持する。
- [x] `04_Documentation/` 配下の文書を「標準的な日本の技術書に準じた文章構成」で記述する方針を README / architecture に反映する。

### Validation plan (検証計画)
- `rg -n "Overview|Tutorial|Scenario|Reference" 04_Documentation/README.md` で導線統一を確認する。
- `rg -n "docs audit|feedback loop|requirements|architecture|test|product gap|未分類" 01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md 02_Architecture/phase6-public-documentation-architecture.md 04_Documentation/README.md` で運用定義を確認する。
- `rg -n "日本の技術書|文章構成|英語交じり" 04_Documentation/README.md 02_Architecture/phase6-public-documentation-architecture.md` で文体方針が反映されたことを確認する。
- `python3 01_Plans/tools/planning_queue.py` で orphan / pending 判定の可視化を確認する。
