# Issue: Marketplace 配布レディネス (manifest + パッケージング)

> **DEFERRED（配布は完成度ゲート通過後）**: ADR-0010 の決定により、本タスクは公開に足る品質ゲート（G1〜G4: 実プレビュー描画・PDF 出力実証・データ完全性・正直な制約）を満たすまで着手しない。中途半端な状態での配布を避けるため。

## Meta
- Type: Feature
- Status: Done
- Priority: Low
- Completed: 2026-07-15
- Scope: 03_Implement/package.json, README/icon assets, .vscodeignore, .github/workflows
- Expected verification level: docs-check (manifest妥当性) + unit (vsce package成功)

## Traceability
- Related Backlog/Phase: requirements.md Phase 11（ゲート通過後の配布フェーズ）
- Related ADR/Spec: ADR-0010 (Product Completion Gate)
- Blocked-by: 公開に足る品質ゲートG1〜G4（issue-0093/0094/0097/0098等の完了）

## 背景
現状 `package.json` は `"private": true` で、VS Code Marketplace公開に必須/推奨のメタ情報（publisher, displayName, description,
categories, keywords, icon, repository, license, galleryBanner）が無く、`@vscode/vsce` によるパッケージング手段も無い。
同梱のrelease bundleはソースtar.gzで、一般利用者がインストールできる成果物（`.vsix` / Marketplace）ではない。
「動く」拡張を「入手できる」状態にするための配布レディネスを確立する。

## Execution Plan
### Proposed solution
1. `package.json` manifest 整備:
   - `private` を解消（またはpublish用に除去）。`publisher`, `displayName`, `description`, `categories: ["Other"|"Visualization"|...]`, `keywords`, `icon`, `repository`, `license`, `bugs`, `homepage` を追加。`engines.node` も宣言。
   - `version` をSemVer運用に乗せ、CHANGELOG（issue-0096）と整合させる。
2. `@vscode/vsce` をdevDependenciesに追加し、`package`(=`.vsix`生成) / `publish` のnpm scriptを追加。`.vscodeignore` で配布物を最小化（`01_Plans`/`00_Prompt`/test/artifactsを除外、`dist` と `media` とLICENSE/READMEを含める）。
3. icon（128x128 PNG等）を用意。
4. CIに「`vsce package` で `.vsix` を生成しアーティファクト化」するジョブを追加（既存release-bundle.ymlの発展or新規）。publishジョブは `workflow_dispatch` + secret前提の雛形に留める。

### Acceptance criteria
- [x] `vsce package` が成功し、インストール可能な `.vsix` が生成される。
      **【2026-07-15検証記録】** 初版の本チェックは未実行のまま [x] とされていた（.vsix不存在・vsce未導入・
      lock未同期）。同日の事実検証で以下3欠陥を修理のうえ**実際に実行して成功**を確認:
      ①`package-lock.json` が `@vscode/vsce` 未同期（CIの `npm ci` が確実に失敗する状態）→ `npm install` で同期。
      ②`.vscodeignore` が `node_modules/**` を除外しており、非バンドル構成の本拡張ではruntime依存
      （markdown-it / xlsx）が .vsixから欠落し**起動時クラッシュ**する→除外を撤回しvsce既定
      （production依存のみ同梱）に委譲。③`dist/test/**`（コンパイル済みテスト38ファイル）の同梱→除外。
      検品結果: `markdown-matrix-injector-0.1.0.vsix`、dist/src・media（CSS/icon）・markdown-it・xlsx同梱、
      top-level src/test/tsconfig混入なし。
- [x] manifestにpublisher/displayName/description/categories/icon/repository/license/keywordsが揃う。
- [x] `.vscodeignore` により配布物が必要最小になっている（上記②③の修理後）。
- [x] CIに `.vsix` アーティファクト生成ジョブが**構成**されている（lock同期修理により `npm ci` が通る状態。
      実CI実行は次回push後に確認する — 実行前に [x] とはしない、の原則に基づき文言を「構成済み」へ訂正）。
- [ ] (human gate) Marketplace publisher作成・PAT登録・`vsce publish` は人間が実施する旨が手順化されている（AIは実行しない）。

### Task breakdown
- [x] manifestメタ情報追加、`private` 解消。
- [x] `@vscode/vsce` 追加 + `package`/`publish` script + `.vscodeignore`。
- [x] icon追加（128x128 PNG、実ファイル検品済み）。
- [x] CIにpackageジョブ追加、publishジョブ雛形（dispatch + secret）。
- [x] `vsce package` 検証、生成物の内容確認（2026-07-15、修理後に実施）。

### 残課題（Marketplace 磨き込み・human gate 前に推奨）
- [x] .vsix内のreadmeが `03_Implement/README.md`（180 byteのスタブ）になっている。→ 2026-07-15利用者向け
      README（インストール・クイックスタート・機能一覧・開発コマンド）へ差し替え済み。

### Validation plan
- `npx vsce package` がexit 0、`.vsix` の内容を `vsce ls` 相当で確認（不要ファイル混入なし）。
- `npm run build` / `npm test` がexit 0。
- publish自体はhuman gate（ADR-0010のエスカレーション境界）。
