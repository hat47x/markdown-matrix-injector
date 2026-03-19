# Issue: Short-circuit smart fallback card rendering before workbook load

## Meta
- Type: Bugfix
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 4: SIer納品品質の担保 (Smart Fallback)
- Related ADR/Spec: `00_Prompt/requirements.md`, `01_Plans/issues/issue-0007-phase4-smart-fallback.md`

## Execution Plan
### Proposed solution (解決策の概要)
- カード表示が確定しているケースではワークブックを先読みせず、Smart Fallback の短絡評価でカードを返す。これにより `mode=card` が、不要な表読込失敗に引きずられず軽量に描画されるようにする。

### Acceptance criteria (受入条件)
- [x] `mode=card` 指定時はワークブック読込前にカード描画へ短絡できること。
- [x] Smart Fallback の大きさ判定や XML 検証が必要なケースでは従来どおりワークブックを読込むこと。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] Smart Fallback 判定を即時条件とワークブック依存条件へ分離する。
- [x] プラグインで先行短絡を実装する。
- [x] 単体テストを追加・更新する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
