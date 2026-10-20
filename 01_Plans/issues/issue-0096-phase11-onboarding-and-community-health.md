# Issue: 利用者向け導線とコミュニティ参加・報告窓口の整備

> **DEFERRED（配布フェーズ）**: ADR-0010 により、コミュニティ整備・利用者向け配布導線は公開に足る品質ゲート通過後に着手する。ただし「README/docs の主張を実測に合わせる正直さ（G4）」は本ゲート内の文書整合ステップで先行して扱う（本 issue とは分離）。

この文書は、配布フェーズの利用者向け導線とコミュニティ整備に関する当時のIssue記録です。冒頭の`DEFERRED`と`Status: Done`をともに保持し、公開品質ゲートの通過やMarketplaceへの公開が現時点で確認されたとは扱いません。原文には検証計画があり、実行結果の証跡節はありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Low
- Completed: 2026-07-15
- Scope: README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md, .github/ISSUE_TEMPLATE, .github/PULL_REQUEST_TEMPLATE.md
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: requirements.md Phase 11（ゲート通過後の配布フェーズ）
- Related ADR/Spec: ADR-0010 (Product Completion Gate)
- Blocked-by: 公開に足る品質ゲートG1〜G4

## 背景
READMEは人間をAGENTS.mdと開発手順へ誘導しており、利用者向けの「インストール → 使い方」導線が無い。
CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOGとIssue/PRテンプレートも未整備で、外部の人間コントリビュータの
参加導線・脆弱性報告窓口が存在しない（既存の整備物はすべてAIエージェント向け）。OSSが社会で活用され、貢献を受け入れる
ためのコミュニティ健全性を整える。

## 当時の実行計画
### 解決方針（当時の提案）
1. README 再構成:
   - 先頭を利用者向け入口に変更（30秒で価値が伝わる説明 + スクリーンショット/GIF）。
   - 「Marketplace / `.vsix` からのインストール」「最小利用 `![[...]]`」「主な機能」「既知の制約」を明記。
   - AIエージェント向けの導線（AGENTS.md / 00_Prompt）は、「Contributing/開発者向け」セクションに整理して残す。
2. コミュニティへの参加と問い合わせのため、次のファイルを整備する。
   - `CONTRIBUTING.md`: 開発フロー（WSL2/Node 22, `npm ci && npm run build && npm test`）、issue/ADR運用、AGENTS.mdへの接続。
   - `CODE_OF_CONDUCT.md`（Contributor Covenant）, `SECURITY.md`（報告窓口・対応方針）, `CHANGELOG.md`（Keep a Changelog形式、現行0.1.0から）。
   - `.github/ISSUE_TEMPLATE/`（bug_report / feature_request）, `.github/PULL_REQUEST_TEMPLATE.md`。

### Acceptance criteria
- [x] README先頭が利用者向けで、インストール・最小利用・スクリーンショット・既知の制約を含む。
- [x] CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOGが存在し、相互リンクが妥当。
- [x] Issue/PRテンプレートが `.github/` に存在する。
- [x] 既存のAI向け導線（AGENTS.md / 00_Prompt）への参照が失われていない。

### 作業項目（Task breakdown）
- [x] README再構成（利用者導線を先頭、開発者導線を後段）。
- [x] CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG追加。
- [x] Issue/PRテンプレート追加。
- [x] スクリーンショット/GIF（既存 `04_Documentation/samples/screenshots/` 資産の活用可否を確認）。

### 当時の検証計画（Validation plan）
- リンク切れ・参照整合のdocs-check。
- AGENTS.md / planning_queueによるpending/orphan不変の確認。
