# Issue: ミッション再定義を要件・README・概要文書へ反映

この文書は当時のIssue記録です。ADR-0012による当時の使命再定義と、requirements・README・overviewへの反映記録です。検証結果として記載された176件のテスト成功は当時の実績であり、現行の再検証ではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: 00_Prompt/requirements.md (§0, フェーズ定義追記), README.md, 04_Documentation/overview.md
- Expected verification level: docs-check + planning_queue整合

## Traceability
- Related Backlog/Phase: ADR-0012 D1/D5/D6（使命再定義・agent-first・KPI差し替え）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md`
- Depends on: なし（ADR-0012 Accepted済み・Human Sponsor承認済み）

## 背景
ADR-0012により、プロダクトの使命は「Excelビューア拡張」から「正本参照規約（MMI Notation）+ 参照実装」へ再定義された。
仕様正本（requirements §0）と公開入口（README / overview）が旧使命のままでは、以降の全ての計画・文書がドリフトする。
上流から順に反映する（本issueが仕様起草issue-0102に先行する）。

## 当時の実行計画
### 解決方針（当時の提案）
1. `requirements.md` §0をADR-0012 D1の使命文へ改訂（「ビューアに徹する」原則はD3-1 Read-only MUSTとして存続・強化）。
2. `requirements.md` にPhase 12（Notation仕様化と規約普及）を定義: 対象 = 仕様書v1、JSON Schema、conformance corpus、KPI差し替え。
3. `README.md` 冒頭の価値記述を「agentic documentationのガードレール / 正本参照規約」を第一声とする構成へ書き換え（VS Code拡張は参照実装として紹介）。
4. `04_Documentation/overview.md` のReader-specific valueに「AIエージェント開発者」視点を追加し、KPI記述をD6へ整合。

### 受入条件（Acceptance criteria）
- [x] requirements §0がADR-0012 D1の使命文と一致し、read-only原則が【恒久規範】として独立明記された（加えて【成果物の位置付け】3層を新設: 規約 / 参照実装 / 表パターン資産）。
- [x] Phase 12（規約仕様化と普及基盤）が §1一覧と §2詳細の両方に定義され、issue-0102の親フェーズとして機能する。
- [x] READMEの第一声が「コピーではなく、参照を。」＋規約/ガードレール定義になり、「なぜ規約なのか」節と提供価値6項目（正本完全性を先頭、AI協働を追加）へ再構成。overviewは4ペルソナ化（AIエージェント開発者を追加）しWhat this tool isを規約ベースへ更新。
- [x] planning_queue orphan 0維持（ADR 13 / issue 102）。旧使命文の残存なしをgrepで確認。npm test 176 pass（回帰なし）。

### 当時の検証計画（Validation plan）（実績）
- 誤字混入の全文走査（編集中に混入した1件を検出・即修正済み）
- `grep 本プラグインのミッション` → 残存なし / `npm test` → 176 pass / `planning_queue.py` → orphan 0
