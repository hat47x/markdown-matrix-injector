# Issue: Phase 4のSmart Fallback発動条件を実装する

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件と検証計画は当時の内容を示しており、現在の実装や後年の判断を新たに確認・更新するものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 4: SIer納品品質の担保 (Smart Fallback)
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Smart Fallback（表をカード表示に切り替える仕組み）の発動条件を判定する補助処理を追加する。`mode=table`を明示していない場合、「巨大表」または「シート未指定のファイル全体参照」をカード表示へ自動的に切り替える。

### 受入条件
- [x] `mode=table` 未指定時、列数10超またはセル数500超の埋め込みがカード表示へ自動縮退すること。
- [x] `mode=table` を明示した場合、巨大表でもテーブル表示を維持すること。
- [x] シート未指定でファイル全体を参照した場合、カード表示へ自動縮退すること。
- [x] 既存の通常サイズの埋め込み表示は維持されること。
- [x] テストとビルドが通ること。

### 作業項目
- [x] Smart Fallback判定ヘルパーを追加する。
- [x] プラグインの描画分岐へ自動縮退ロジックを組み込む。
- [x] 単体テストを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
