# Issue: Phase 3のキャプションと印刷制御用コンテナを実装する

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件と検証計画は当時の内容であり、現行製品の仕様や後年の判断を示すものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 3: 脱Word・エンタープライズ印刷制御
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 埋め込み結果をHTMLコンテナで囲み、`caption`、`id`、`pageBreak`、`orientation` の各クエリパラメータを表現できるようにする。表とカードのどちらの描画にも、一貫したメタデータを付与する。

### 受入条件
- [x] `caption=...` 指定時に埋め込み結果の上部または `figcaption` としてキャプションを描画できること。
- [x] `id=...` 指定時にコンテナへIDを付与できること。
- [x] `pageBreak=before|after|both` 指定時に印刷制御用の属性またはクラスを付与できること。
- [x] `orientation=landscape|portrait` 指定時に印刷CSSと連携可能な属性またはクラスを付与できること。
- [x] テストとビルドが通ること。

### 作業項目
- [x] 埋め込みコンテナ描画ヘルパーを追加する。
- [x] テーブル/カード描画から共通コンテナを利用する。
- [x] 単体テストを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
