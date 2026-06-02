# Issue: 利用者導線とコミュニティ健全性の整備 (Onboarding & Trust)

> **DEFERRED（配布フェーズ）**: ADR-0010 により、コミュニティ整備・利用者向け配布導線は公開に足る品質ゲート通過後に着手する。ただし「README/docs の主張を実測に合わせる正直さ（G4）」は本ゲート内の文書整合ステップで先行して扱う（本 issue とは分離）。

## Meta
- Type: Docs
- Status: Draft
- Priority: Low
- Scope: README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md, .github/ISSUE_TEMPLATE, .github/PULL_REQUEST_TEMPLATE.md
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: requirements.md Phase 11（ゲート通過後の配布フェーズ）
- Related ADR/Spec: ADR-0010 (Product Completion Gate)
- Blocked-by: 公開に足る品質ゲート G1〜G4

## 背景
README は人間を AGENTS.md と開発手順へ誘導しており、利用者向けの「インストール → 使い方」導線が無い。
CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG と Issue/PR テンプレートも未整備で、外部の人間コントリビュータの
参加導線・脆弱性報告窓口が存在しない（既存の整備物はすべて AI エージェント向け）。OSS が社会で活用され、貢献を受け入れる
ためのコミュニティ健全性を整える。

## Execution Plan
### Proposed solution
1. README 再構成:
   - 先頭を利用者向け入口に変更（30 秒で価値が伝わる説明 + スクリーンショット/GIF）。
   - 「Marketplace / `.vsix` からのインストール」「最小利用 `![[...]]`」「主な機能」「既知の制約」を明記。
   - AI エージェント向け導線（AGENTS.md / 00_Prompt）は「Contributing/開発者向け」セクションへ整理して残す。
2. コミュニティ健全性ファイル:
   - `CONTRIBUTING.md`: 開発フロー（WSL2/Node 22, `npm ci && npm run build && npm test`）、issue/ADR 運用、AGENTS.md への接続。
   - `CODE_OF_CONDUCT.md`（Contributor Covenant）, `SECURITY.md`（報告窓口・対応方針）, `CHANGELOG.md`（Keep a Changelog 形式、現行 0.1.0 から）。
   - `.github/ISSUE_TEMPLATE/`（bug_report / feature_request）, `.github/PULL_REQUEST_TEMPLATE.md`。

### Acceptance criteria
- [ ] README 先頭が利用者向けで、インストール・最小利用・スクリーンショット・既知の制約を含む。
- [ ] CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG が存在し、相互リンクが妥当。
- [ ] Issue/PR テンプレートが `.github/` に存在する。
- [ ] 既存の AI 向け導線（AGENTS.md / 00_Prompt）への参照が失われていない。

### Task breakdown
- [ ] README 再構成（利用者導線を先頭、開発者導線を後段）。
- [ ] CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG 追加。
- [ ] Issue/PR テンプレート追加。
- [ ] スクリーンショット/GIF（既存 `04_Documentation/samples/screenshots/` 資産の活用可否を確認）。

### Validation plan
- リンク切れ・参照整合の docs-check。
- AGENTS.md / planning_queue による pending/orphan 不変の確認。
