# Issue: Restructure repository into layered implementation directories

## Meta
- Type: Refactor
- Status: Done
- Priority: High
- Scope: `README.md`, `02_Architecture`, `03_Implement`, `04_Documentation`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 1: コアエンジンとパフォーマンス基盤
- Related ADR/Spec: `00_Prompt/system_prompt.md`, `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 5層アーキテクチャに合わせて `02_Architecture`, `03_Implement`, `04_Documentation` を作成し、実装コード・テスト・ビルド設定を `03_Implement` 配下へ移設する。

### Acceptance criteria (受入条件)
- [x] `02_Architecture`, `03_Implement`, `04_Documentation` が作成されていること。
- [x] 今回追加済みのプログラム類が `03_Implement` 配下へ移動していること。
- [x] `03_Implement` 配下で `npm test` と `npm run build` が成功すること。
- [x] リポジトリの導線ドキュメントが新構成を説明していること。

### Task breakdown (作業分解)
- [x] ディレクトリを新設し、実装資産を移動する。
- [x] README / ignore設定を更新する。
- [x] テストとビルドを新しい配置で実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
