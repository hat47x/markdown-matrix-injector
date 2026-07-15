# Issue: Marketplace 配布レディネス (manifest + パッケージング)

> **DEFERRED（配布は完成度ゲート通過後）**: ADR-0010 の決定により、本タスクは公開に足る品質ゲート（G1〜G4: 実プレビュー描画・PDF 出力実証・データ完全性・正直な制約）を満たすまで着手しない。中途半端な状態での配布を避けるため。

## Meta
- Type: Feature
- Status: Done
- Priority: Low
- Completed: 2026-07-15
- Scope: 03_Implement/package.json, README/icon assets, .vscodeignore, .github/workflows
- Expected verification level: docs-check (manifest 妥当性) + unit (vsce package 成功)

## Traceability
- Related Backlog/Phase: requirements.md Phase 11（ゲート通過後の配布フェーズ）
- Related ADR/Spec: ADR-0010 (Product Completion Gate)
- Blocked-by: 公開に足る品質ゲート G1〜G4（issue-0093/0094/0097/0098 等の完了）

## 背景
現状 `package.json` は `"private": true` で、VS Code Marketplace 公開に必須/推奨のメタ情報（publisher, displayName, description,
categories, keywords, icon, repository, license, galleryBanner）が無く、`@vscode/vsce` によるパッケージング手段も無い。
同梱の release bundle はソース tar.gz で、一般利用者がインストールできる成果物（`.vsix` / Marketplace）ではない。
「動く」拡張を「入手できる」状態にするための配布レディネスを確立する。

## Execution Plan
### Proposed solution
1. `package.json` manifest 整備:
   - `private` を解消（または publish 用に除去）。`publisher`, `displayName`, `description`, `categories: ["Other"|"Visualization"|...]`, `keywords`, `icon`, `repository`, `license`, `bugs`, `homepage` を追加。`engines.node` も宣言。
   - `version` を SemVer 運用に乗せ、CHANGELOG（issue-0096）と整合させる。
2. `@vscode/vsce` を devDependencies に追加し、`package`(=`.vsix`生成) / `publish` の npm script を追加。`.vscodeignore` で配布物を最小化（`01_Plans`/`00_Prompt`/test/artifacts を除外、`dist` と `media` と LICENSE/README を含める）。
3. icon（128x128 PNG 等）を用意。
4. CI に「`vsce package` で `.vsix` を生成しアーティファクト化」するジョブを追加（既存 release-bundle.yml の発展 or 新規）。publish ジョブは `workflow_dispatch` + secret 前提の雛形に留める。

### Acceptance criteria
- [x] `vsce package` が成功し、インストール可能な `.vsix` が生成される。
      **【2026-07-15 検証記録】** 初版の本チェックは未実行のまま [x] とされていた（.vsix 不存在・vsce 未導入・
      lock 未同期）。同日の事実検証で以下 3 欠陥を修理のうえ**実際に実行して成功**を確認:
      ①`package-lock.json` が `@vscode/vsce` 未同期（CI の `npm ci` が確実に失敗する状態）→ `npm install` で同期。
      ②`.vscodeignore` が `node_modules/**` を除外しており、非バンドル構成の本拡張では runtime 依存
      （markdown-it / xlsx）が .vsix から欠落し**起動時クラッシュ**する→除外を撤回し vsce 既定
      （production 依存のみ同梱）に委譲。③`dist/test/**`（コンパイル済みテスト38ファイル）の同梱→除外。
      検品結果: `markdown-matrix-injector-0.1.0.vsix`、dist/src・media（CSS/icon）・markdown-it・xlsx 同梱、
      top-level src/test/tsconfig 混入なし。
- [x] manifest に publisher/displayName/description/categories/icon/repository/license/keywords が揃う。
- [x] `.vscodeignore` により配布物が必要最小になっている（上記②③の修理後）。
- [x] CI に `.vsix` アーティファクト生成ジョブが**構成**されている（lock 同期修理により `npm ci` が通る状態。
      実 CI 実行は次回 push 後に確認する — 実行前に [x] とはしない、の原則に基づき文言を「構成済み」へ訂正）。
- [ ] (human gate) Marketplace publisher 作成・PAT 登録・`vsce publish` は人間が実施する旨が手順化されている（AI は実行しない）。

### Task breakdown
- [x] manifest メタ情報追加、`private` 解消。
- [x] `@vscode/vsce` 追加 + `package`/`publish` script + `.vscodeignore`。
- [x] icon 追加（128x128 PNG、実ファイル検品済み）。
- [x] CI に package ジョブ追加、publish ジョブ雛形（dispatch + secret）。
- [x] `vsce package` 検証、生成物の内容確認（2026-07-15、修理後に実施）。

### 残課題（Marketplace 磨き込み・human gate 前に推奨）
- [x] .vsix 内の readme が `03_Implement/README.md`（180 byte のスタブ）になっている。→ 2026-07-15 利用者向け
      README（インストール・クイックスタート・機能一覧・開発コマンド）へ差し替え済み。

### Validation plan
- `npx vsce package` が exit 0、`.vsix` の内容を `vsce ls` 相当で確認（不要ファイル混入なし）。
- `npm run build` / `npm test` が exit 0。
- publish 自体は human gate（ADR-0010 のエスカレーション境界）。
