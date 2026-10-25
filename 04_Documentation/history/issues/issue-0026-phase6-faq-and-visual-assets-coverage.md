# Issue: Phase 6の公開文書にFAQと図表への案内を整える

この文書は、Phase 6当時のFAQと視覚補助資料の整備方針、完了状態、検証結果を残したIssue記録です。議事録と2026年3月29日の証跡は当時の内容であり、現在の公開文書を新たに点検したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `04_Documentation/overview.md`, `04_Documentation/tutorial.md`, `04_Documentation/scenario-sier-design-docs.md`, `04_Documentation/reference.md`, `04_Documentation/README.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 6 Public Documentation & Adoption
- Related ADR/Spec: `00_Prompt/requirements.md` (Phase 6 Documentation quality gate), `02_Architecture/phase6-public-documentation-architecture.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 公開文書の4つの入口（Overview / Tutorial / Scenario / Reference）を横断して点検し、よくある質問（FAQ）、スクリーンショット、比較表の有無を文書ごとに整理する。
- 最小限の対応として、FAQの節と、画像または表を参照するための案内を追加する。読者がつまずきやすい点について、READMEから該当する説明へたどれる構成にそろえる。
- 文書監査（docs audit）の記録とフィードバック分類（feedback classification）を更新し、発見事項をrequirements / architecture / implement testへ戻す必要があるかを明記する。

### 受入条件（Acceptance criteria）
- [x] 4文書すべてにFAQの有無・配置方針が明示され、欠落文書にはFAQを追加する。
- [x] スクリーンショットまたは比較表のどちらを採用するかを文書ごとに判定し、少なくとも2文書で視覚補助素材を新規追加する。
- [x] `04_Documentation/README.md` からFAQ / 視覚補助素材に到達できる導線を追加する。
- [x] docs auditとfeedback loopの結果を `04_Documentation/process/templates` の運用テンプレートに沿って記録し、必要なら派生issueを起票する。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行でorphan issueが0件のままである。

### 作業項目（Task breakdown）
- [x] 既存公開文書のFAQ / 視覚素材の有無を監査し、差分メモを作成する。
- [x] 優先2文書以上にFAQと視覚補助素材を追加する。
- [x] README導線および運用テンプレート更新を実施する。
- [x] triageコマンドを実行してpending/orphan状態を確認する。

### 当時の検証計画（Validation plan）
- `python3 03_Implement/tools/planning_queue.py`
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
  - `python3 03_Implement/tools/planning_queue.py`
  - `rg "FAQ|よくある質問|スクリーンショット|比較表" 04_Documentation/README.md 04_Documentation/overview.md 04_Documentation/tutorial.md 04_Documentation/scenario-sier-design-docs.md 04_Documentation/reference.md`
- Result summary:
  - 公開導線4文書へFAQセクションを追加。
  - Overview / Tutorialへ比較表を追加し、Scenarioの既存ROI比較表と合わせて視覚補助素材を強化。
  - READMEにFAQ / 視覚補助素材の導線マップを追加。
  - docs audit / feedback classificationの記録を `04_Documentation/process/templates/` に作成。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
