# Issue: Phase 6 FAQ と視覚補助素材（スクリーンショット/比較表）カバレッジ整備

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `04_Documentation/overview.md`, `04_Documentation/tutorial.md`, `04_Documentation/scenario-sier-design-docs.md`, `04_Documentation/reference.md`, `04_Documentation/README.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 6 Public Documentation & Adoption
- Related ADR/Spec: `00_Prompt/requirements.md` (Phase 6 Documentation quality gate), `02_Architecture/phase6-public-documentation-architecture.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 公開導線4文書（Overview/Tutorial/Scenario/Reference）を横断監査し、FAQ・スクリーンショット・比較表の欠落を文書ごとに棚卸しする。
- 最小構成としてFAQセクションと視覚補助素材の参照導線（画像または表）を追加し、読者別のつまずきに対する一次回答をREADMEから辿れるように統一する。
- docs auditログとfeedback classificationを更新し、requirements / architecture / implement testへの還流要否を明文化する。

### Acceptance criteria (受入条件)
- [x] 4文書すべてにFAQの有無・配置方針が明示され、欠落文書にはFAQを追加する。
- [x] スクリーンショットまたは比較表のどちらを採用するかを文書ごとに判定し、少なくとも2文書で視覚補助素材を新規追加する。
- [x] `04_Documentation/README.md` からFAQ / 視覚補助素材に到達できる導線を追加する。
- [x] docs auditとfeedback loopの結果を `01_Plans/templates` の運用テンプレートに沿って記録し、必要なら派生issueを起票する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行でorphan issueが0件のままである。

### Task breakdown (作業分解)
- [x] 既存公開文書のFAQ / 視覚素材の有無を監査し、差分メモを作成する。
- [x] 優先2文書以上にFAQと視覚補助素材を追加する。
- [x] README導線および運用テンプレート更新を実施する。
- [x] triageコマンドを実行してpending/orphan状態を確認する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/planning_queue.py`
- `rg "FAQ|よくある質問|スクリーンショット|比較表" 04_Documentation/README.md 04_Documentation/overview.md 04_Documentation/tutorial.md 04_Documentation/scenario-sier-design-docs.md 04_Documentation/reference.md`

## 議事録 (AI読込不要)
### Virtual stakeholder consensus (Round summary)
- Issue definition:
  - Phase 6 quality gateではFAQ / サンプル / スクリーンショット等の補助素材評価が要求される一方、公開導線4文書で配置基準が統一されていない。
- Architecture Lead:
  - 文書間で配置ルールがバラつくとdocs auditの再現性が落ちるため、README側に導線の正本を置くべき。
- Product/UX Lead:
  - 初見読者は失敗パターンから学ぶためFAQを優先し、画像は導線理解に効く箇所へ限定投入すべき。
- QA/Delivery Lead:
  - 監査結果をテンプレートへ残さないとfeedback loopが切れる。最小でもtriageとorphan 0を受入条件に含めるべき。
- Decision:
  - 次フェーズ（次issue）としてFAQと視覚補助素材のカバレッジ整備をOpen化し、README導線・監査記録・triage維持を同時達成する。
  - トレードオフとして、全ページ一括改稿は避け、まず2文書以上への追加で反復可能性を優先する。

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/planning_queue.py`
  - `rg "FAQ|よくある質問|スクリーンショット|比較表" 04_Documentation/README.md 04_Documentation/overview.md 04_Documentation/tutorial.md 04_Documentation/scenario-sier-design-docs.md 04_Documentation/reference.md`
- Result summary:
  - 公開導線4文書へFAQセクションを追加。
  - Overview / Tutorialへ比較表を追加し、Scenarioの既存ROI比較表と合わせて視覚補助素材を強化。
  - READMEにFAQ / 視覚補助素材の導線マップを追加。
  - docs audit / feedback classificationの記録を `01_Plans/templates/` に作成。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
