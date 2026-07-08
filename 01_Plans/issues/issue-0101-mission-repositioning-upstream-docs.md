# Issue: ミッション再定義の上流反映 (requirements §0 / README / overview)

## Meta
- Type: Docs
- Status: Open
- Priority: High
- Scope: 00_Prompt/requirements.md (§0, フェーズ定義追記), README.md, 04_Documentation/overview.md
- Expected verification level: docs-check + planning_queue 整合

## Traceability
- Related Backlog/Phase: ADR-0012 D1/D5/D6（使命再定義・agent-first・KPI 差し替え）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md`
- Depends on: なし（ADR-0012 Accepted 済み・Human Sponsor 承認済み）

## 背景
ADR-0012 により、プロダクトの使命は「Excel ビューア拡張」から「正本参照規約（MMI Notation）+ 参照実装」へ再定義された。
仕様正本（requirements §0）と公開入口（README / overview）が旧使命のままでは、以降の全ての計画・文書がドリフトする。
上流から順に反映する（本 issue が仕様起草 issue-0102 に先行する）。

## Execution Plan
### Proposed solution
1. `requirements.md` §0 を ADR-0012 D1 の使命文へ改訂（「ビューアに徹する」原則は D3-1 Read-only MUST として存続・強化）。
2. `requirements.md` に Phase 12（Notation 仕様化と規約普及）を定義: 対象 = 仕様書 v1、JSON Schema、conformance corpus、KPI 差し替え。
3. `README.md` 冒頭の価値記述を「agentic documentation のガードレール / 正本参照規約」を第一声とする構成へ書き換え（VS Code 拡張は参照実装として紹介）。
4. `04_Documentation/overview.md` の Reader-specific value に「AI エージェント開発者」視点を追加し、KPI 記述を D6 へ整合。

### Acceptance criteria
- [ ] requirements §0 が ADR-0012 D1 の使命文と一致し、read-only 原則が規範として残存する。
- [ ] Phase 12 が定義され、issue-0102 の親フェーズとして機能する。
- [ ] README / overview の第一声が「規約 + ガードレール」であり、旧「ビューア拡張」中心の記述が残らない。
- [ ] planning_queue で orphan 0 を維持。

### Validation plan
- docs-check 相当（リンク整合・用語整合の目視）
- `python3 01_Plans/tools/planning_queue.py` で pending/orphan 確認
