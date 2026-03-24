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
- [ ] docs audit の運用フローを定義する。
- [ ] 反映先ごとの分類テンプレートを作成する。
- [ ] audit結果の記録様式（Markdown）を追加する。
- [ ] triageコマンドで運用可能性を検証する。

### Validation plan (検証計画)
- `rg -n "docs audit|feedback loop|requirements|architecture|test|product gap|未分類" 01_Plans 02_Architecture/phase6-public-documentation-architecture.md 04_Documentation/README.md` で運用定義を確認する。
- `python3 01_Plans/tools/planning_queue.py` で pending issue が新規計画として可視化されることを確認する。
