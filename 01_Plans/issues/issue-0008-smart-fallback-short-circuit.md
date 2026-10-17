# Issue: ワークブックを読み込む前にカード表示を判定する

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件と検証計画は当時の内容を示しており、現在の実装や後年の判断を新たに確認・更新するものではありません。

## Meta
- Type: Bugfix
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 4: SIer納品品質の担保 (Smart Fallback)
- Related ADR/Spec: `00_Prompt/requirements.md`, `01_Plans/issues/issue-0007-phase4-smart-fallback.md`

## 当時の実行計画
### 解決方針（当時の提案）
- カード表示が確定している場合は、ワークブックの読み込みより先にSmart Fallbackの短絡評価を行い、カードを返す。これにより、`mode=card`指定時に不要な表の読み込みで失敗することを避け、軽量に描画できるようにする。

### 受入条件
- [x] `mode=card` 指定時はワークブック読込前にカード描画へ短絡できること。
- [x] Smart Fallbackの大きさ判定やXML検証が必要なケースでは従来どおりワークブックを読込むこと。
- [x] テストとビルドが通ること。

### 作業項目
- [x] Smart Fallback判定を即時条件とワークブック依存条件へ分離する。
- [x] プラグインで先行短絡を実装する。
- [x] 単体テストを追加・更新する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
