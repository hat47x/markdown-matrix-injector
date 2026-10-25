# Issue: VSIX実機検証と日本語の公開用使用例・操作ガイド

## Meta
- Type: Bugfix
- Status: Done
- Priority: High
- Scope: VS Code preview integration, practical samples, README, tutorial, manual, release evidence
- Expected verification level: manual-e2e

## Traceability
- Related Backlog/Phase: requirements.md Phase 6 / Phase 11 G1–G4
- Related ADR/Spec: ADR-0010, ADR-0011, 00_Prompt/requirements.md

## Execution Plan
### Proposed solution
2026-09-08の利用者依頼に基づく正式リリース準備。既存の未コミット修正を保持し、既存VSIXをWindows VS Codeにインストールして検証する。issue-0100の実クリック検証中に、標準プレビューで記法が未展開の不具合を発見したため、その前提修復を本Issueで先行する。仕様変更・Marketplace公開・タグ作成は含めない。

### Acceptance criteria
- [x] activateの公開APIを標準Markdown拡張が取得でき、インストール済みVSIXの実プレビューで表が表示される。
- [x] CSV / XLSX / SpreadsheetMLの実務サンプル、クエリ・別紙・診断・納品一覧の利用例を揃える。
- [x] 実VS Codeのスクリーンショットと操作動画を採取し、自然な日本語のREADME・チュートリアル・マニュアルから参照できる。
- [x] build・unit・Extension Host・サンプル検証と原本ハッシュ比較を実施し、PDFおよび未確認操作の範囲を明記する。
- [x] 更新版VSIXとサンプル配布物を作成し、導入内容・検証結果・残課題を追跡可能にする。

### Task breakdown
1. プレビュー公開APIの前提修復と実機再確認。
2. 実務サンプルと各参照の期待結果を作成。
3. 実機操作、画像・動画、PDF、非改変確認。
4. 読者向け文書と同梱READMEを整備し、パッケージを再検証。

### Validation plan
`npm run build`, `npm test`, Extension Hostで`extension.activate()`の返すAPIから描画する回帰確認、実Windows VS Code 1.136.1でVSIXインストール・プレビュー・カード・補完・診断・納品コマンドを確認。新規サンプルを製品パイプラインで展開し、表の件数・値と原本SHA-256を検査。画像・動画の表示と文書リンクを確認する。

## 2026-09-09 検証結果

231単体テスト、Extension Host 1.136.1、サンプル12本の期待結果・検査前後ハッシュ比較が成功。標準プレビューを修復し実Windows上で表とカードを確認。画像3点とPDFのページ画像、日本語字幕付き静止画解説動画を作成。README・チュートリアル・利用マニュアルを整備し19文書のローカルリンクに欠落なし。

リリースゲートはG2/G3/G4成功、G1は未完了Issue 2件により不合格。正式リリース扱いにしない。

ロック解除後、修正済みURIボタンをクリックすると、VS Codeの拡張URI許可画面に到達した。許可画面の操作はユーザーへ引き継ぎ、Excel起動確認と連続操作録画を継続する。ADR-0015参照。

## 最終確認

ユーザーのURI許可後、Excelで状態遷移シートを確認。納品一覧2件、診断3件、シート補完3候補と補完後の表表示を実機で検証し画像を採取。連続した実操作録画120秒を2倍速・字幕付き60秒の動画に編集。静止画解説36秒も別途収録。原本14ファイルは実機操作後もハッシュ一致。文書とサンプルを配布ZIPへ同梱し、候補VSIXを再インストール。正式公開は依頼範囲外。

最終リリースゲートはG1〜G4すべて成功（orphan=0 / pending=0）。
