# Issue: Phase 6 スクリーンショット証跡パック整備（Visual Aid 実画面の追加）

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `04_Documentation/overview.md`, `04_Documentation/tutorial.md`, `04_Documentation/scenario-sier-design-docs.md`, `04_Documentation/README.md`, `04_Documentation/samples/`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 6 Public Documentation & Adoption
- Related ADR/Spec: `00_Prompt/requirements.md` (Phase 6 Documentation quality gate), `01_Plans/issues/issue-0026-phase6-faq-and-visual-assets-coverage.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 比較表中心で整備したvisual aidを補完するため、実画面スクリーンショットを最小3ケース（通常埋め込み / Smart Fallback / 印刷制御確認）で追加する。
- 画像は `04_Documentation/samples/` 配下に配置し、READMEの導線表から各文書の該当節へ1ホップで到達できる構造に統一する。
- 画像更新の運用ルール（撮影条件、VSCodeバージョン、テーマ、再撮影トリガー）を文書化し、次回docs auditの再現性を確保する。

### Acceptance criteria (受入条件)
- [x] `overview.md` / `tutorial.md` / `scenario-sier-design-docs.md` のうち少なくとも2文書に、実画面スクリーンショットを埋め込み表示する。
- [x] スクリーンショットは最低3種類（通常埋め込み、Smart Fallback、印刷制御関連）を満たす。
- [x] `04_Documentation/README.md` に画像配置先と参照節の導線を追加する。
- [x] 画像更新運用ルールを `04_Documentation/samples/README.md` へ追記する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行でorphan issueが0件のままである。

### Task breakdown (作業分解)
- [x] 画像ケース定義（3ケース）と撮影条件を確定する。
- [x] 画像ファイルを配置し、対象文書へ埋め込みリンクを追加する。
- [x] README導線とsamples運用ルールを更新する。
- [x] triageコマンドを実行してpending/orphan状態を確認する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/planning_queue.py`
- `rg "!\[.*\]\(.*\)|スクリーンショット|Smart Fallback|印刷制御" 04_Documentation/README.md 04_Documentation/overview.md 04_Documentation/tutorial.md 04_Documentation/scenario-sier-design-docs.md 04_Documentation/samples/README.md`

## 議事録 (AI読込不要)
### Virtual stakeholder consensus (Round summary)
- Issue definition:
  - issue-0026でFAQと比較表は揃ったが、実画面ベースのvisual aidが不足しており、導入判断者の納得材料が弱い。
- Architecture Lead:
  - 画像運用ルールを同時に決めないとdocs auditで陳腐化するため、samples READMEに更新条件を固定すべき。
- Product/UX Lead:
  - 初見ユーザーはテキストより画面で理解しやすいため、最小3ケースの実画面を優先投入すべき。
- QA/Delivery Lead:
  - 画像の追加だけでは不十分で、READMEからの到達性とtriage整合を受入条件に含めるべき。
- Decision:
  - 次フェーズとして「スクリーンショット証跡パック」をOpen化し、画像本体・導線・運用ルールを1セットで整備する。

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/planning_queue.py`
  - `rg "!\\[.*\\]\\(.*\\)|スクリーンショット|Smart Fallback|印刷制御" 04_Documentation/README.md 04_Documentation/overview.md 04_Documentation/tutorial.md 04_Documentation/scenario-sier-design-docs.md 04_Documentation/samples/README.md`
- Result summary:
  - `04_Documentation/samples/screenshots/` 配下に3種類の画像資産（通常埋め込み、Smart Fallback、印刷制御）を追加。
  - overview / tutorialへ画像埋め込みを追加し、scenarioへ参照導線を追加。
  - READMEとsamples READMEに画像配置先・運用ルールを追記。
  - planning queueのorphanは0件を維持。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
