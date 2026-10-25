# Issue: 実装ディレクトリを5層アーキテクチャに沿って再構成する

この文書は、Phase 1当時の作業方針と完了状態を残した記録です。以下の状態、受入条件、検証計画は当時の内容を示しており、現在の実装構成や検証結果を更新するものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: High
- Scope: `README.md`, `02_Architecture`, `03_Implement`, `04_Documentation`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 1: コアエンジンとパフォーマンス基盤
- Related ADR/Spec: `00_Prompt/system_prompt.md`, `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 当時の5層アーキテクチャに沿って `02_Architecture`、`03_Implement`、`04_Documentation` を作成し、実装コード・テスト・ビルド設定を `03_Implement` 配下へ移す。

### 受入条件
- [x] `02_Architecture`, `03_Implement`, `04_Documentation` が作成されていること。
- [x] 今回追加済みのプログラム類が `03_Implement` 配下へ移動していること。
- [x] `03_Implement` 配下で `npm test` と `npm run build` が成功すること。
- [x] リポジトリの導線ドキュメントが新構成を説明していること。

### 作業項目
- [x] ディレクトリを新設し、実装資産を移動する。
- [x] README / ignore設定を更新する。
- [x] テストとビルドを新しい配置で実行する。

### 当時の検証計画
- `cd 03_Implement && npm test` が通過することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
