# Issue: 中間報告向けのローカル試用版整備

## Meta
- Type: Bugfix
- Status: Done
- Priority: High
- Scope: 03_Implement/package.json, 03_Implement/package-lock.json, shell runner, Workbook読込と近接テスト
- Expected verification level: integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 11（完成度・データ完全性）
- Related ADR/Spec: ADR-0010, ADR-0011

## 背景
2026-09-08の現行コード検証ではbuildと226テストが通ったが、配布依存のnpm auditでhigh 2件・moderate 1件を検出した。またWindows checkoutのCRLFによりWSLのE2E runnerが起動しなかった。

## Execution Plan
### Acceptance criteria
- [x] Markdown解析依存を互換範囲で更新し、SheetJSは公式配布版へ更新する。
- [x] shell runnerのLFを固定する。
- [x] build・全既存テスト・実Extension Hostの検証結果を記録する。
- [x] 配布依存のaudit結果とVSIX作成結果を記録する。
- [x] issue-0100の実クリック確認を代替したと主張せず、試用版と正式完成を区別する。

### Validation plan
`npm run build`、`npm test`、`npm run test:e2e`、`npm audit --omit=dev`、VSIX内容検査。SheetJS更新は[公式NodeJS導入手順](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)に従う。正本表の編集機能や新しい製品要件は追加しない。

## Validation evidence（2026-09-08）

- WSL / Node 22.23.2でbuild成功。`npm test`は226 passed / 0 failed、Phase 9の2種類の同期検査も成功。
- SheetJS 0.20.3のESM版ではNode fsが自動接続されず、更新直後に4テストが失敗。製品側3箇所を`fs.readFile`によるバイト入力と`XLSX.read`へ変更し、テストfixtureもバッファ出力へ変更した。読取専用を維持し、日付表示・原本保護・描画の既存テストを再実行して上記成功を確認。
- `npm audit --omit=dev --json`は検出0件。開発依存まで含めるとtsx配下のesbuild 0.27.4にlow 1件が残る。配布物にesbuildは含まれない。監査0件を安全性全般の保証とはしない。
- Xvfb経路はX server不足で起動失敗。利用可能なWSLgへ切り替え、`MMI_ENABLE_TEST_COMMANDS=1 timeout --kill-after=5s 60s node --import tsx ./test/e2e/runTest.ts`を実行。VS Code 1.136.1の実Extension Hostでexit 0。描画入口・provider登録・fallback・共通処理・補完・診断を確認。`autocompleteSheetCompletionStable=true`。
- VSIXを作成（243 files）。SheetJS等の実行依存を同梱し、開発テストを除外。ローカル試用版であり、公開・タグ・バージョン更新はしていない。
- 実OSのpaste/drop操作・外部アプリを開くクリックは未確認。issue-0100はIn Progressを維持する。本IssueのDoneは試用版整備の完了であり、製品全体の完成判定ではない。
- 中間報告とローカル証跡は`C:\GIT\コミュニティ活動\報告素材_2026-09-08`へ保存。未コミットの修正を含むため、既存HEADのみを配布物の完全なsource revisionとは表示しない。
