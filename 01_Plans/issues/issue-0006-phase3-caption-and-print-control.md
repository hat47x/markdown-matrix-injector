# Issue: Implement Phase 3 caption and print control container rendering

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 3: 脱Word・エンタープライズ印刷制御
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 埋め込み結果を HTML コンテナでラップし、`caption`, `id`, `pageBreak`, `orientation` の各クエリパラメータを表現できるようにする。表描画・カード描画の双方に一貫したメタデータ付与を行う。

### Acceptance criteria (受入条件)
- [x] `caption=...` 指定時に埋め込み結果の上部または `figcaption` としてキャプションを描画できること。
- [x] `id=...` 指定時にコンテナへ ID を付与できること。
- [x] `pageBreak=before|after|both` 指定時に印刷制御用の属性またはクラスを付与できること。
- [x] `orientation=landscape|portrait` 指定時に印刷 CSS と連携可能な属性またはクラスを付与できること。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] 埋め込みコンテナ描画ヘルパーを追加する。
- [x] テーブル/カード描画から共通コンテナを利用する。
- [x] 単体テストを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
