# リリース準備の検証記録（2026-09-08〜09）

以下は2026年9月8〜9日に実施した、候補配布物と開発環境での検証記録です。この文書にある成功・未確認の区分は当時の観測範囲を示し、今回改めて実機試験を行ったことを意味しません。

Windows版VS Codeに0.1.0の候補VSIXをインストールし、表・別紙・補完・診断・納品一覧の実操作を確認しました。教材、画像、動画、PDFを同梱しています。Marketplace公開・タグ作成・コミット・pushは行っていません。

## 対象と結果

対象は、当時の未コミット変更を含むローカル候補です。作業前から存在した試用準備の修正は保持しています。インストールしたVSIXのSHA-256は `0b0b044b21e6f5ba4cd850e2621a700fd442c4621fc89f9e6eeea817f74c1f06` です。

| 項目 | 結果と範囲 |
| --- | --- |
| Windows VS Code | 1.136.1。最終候補VSIXをCLIでインストールして新規ウィンドウで確認 |
| 標準プレビュー | CSVの表、3件の強調表示、別紙カード、Excelの状態遷移表を実機で確認 |
| 外部アプリ | カードのURIボタンをクリック。許可画面をユーザーが操作した後、design.xlsxがExcelで開いた |
| シート補完 | Ctrl+SpaceでAPI・権限・状態遷移の3候補を表示。状態遷移を選び範囲を追記し、4行の表を確認 |
| 診断 | ファイルなし・シートなし・非対応XMLの3件を問題パネルで確認 |
| 納品一覧 | コマンドでdesign.xlsxとapplications-wide.csvの2件をCSVへ出力。実ファイルも同梱 |
| 単体テスト | 231件成功、失敗0件 |
| Extension Host | WSL上のVS Code 1.136.1で成功。activateの公開API、分離したパース／描画、補完・診断等を検証 |
| サンプル | 12シナリオ。CSV9ファイル172レコード、Excel3シート34レコード、SpreadsheetML、TSV。表・カード・意図した描画エラーを自動検査 |
| 原本保護 | 実機操作後も元データ14ファイルのSHA-256が検証前と一致。再描画前後も一致 |
| PDF | MMIで展開したHTMLをWeasyPrint 69.0で変換。日本語と縦・横・縦の全3ページを画像で確認 |
| メディア | 実画面7点＋PDF画像1点。実操作120秒を2倍速・字幕付き60秒に編集。別途、静止画解説36秒 |

[サンプルの機械検証結果](media/release-20260908/sample-verification.json) · [実機検証の機械可読記録](media/release-20260908/manual-verification.json) · [画像・動画一覧](media/release-20260908/README.md)

## 見つかった問題と対応

1. activateがMarkdown向けAPIを返さず、標準プレビューで記法が展開されなかった。APIを返し、Extension HostテストもこのAPIを使うよう変更。
2. 標準Markdown拡張が文書URIを描画時に渡すことに対応していなかった。パース時は専用トークンを作り、描画時に参照先を解決するよう変更。実機で再確認済み。
3. 範囲を省略したクエリが診断処理でファイル名・シート名に混入していた。クエリを分離し、回帰テストを追加。
4. 旧commandリンクでは外部アプリが起動しなかった。拡張URI方式に変更。信頼済みのローカルワークスペース内の実ファイルと対応形式だけを受け付ける。[ADR-0015](../01_Plans/adr/ADR-0015-preview-open-uri.md)。修正後のExcel起動を確認済み。
5. XML練習例に形式とシート名の診断が重複していたため、形式だけを確認する参照に整理。教材の意図どおり3種類を1件ずつ示す。

初回のウィンドウ指定録画は黒画面になったため配布対象から除外。対象VS Code領域を画面録画する方式で撮り直し、開始・中間・終盤のフレームを確認しました。

## 確認していない範囲

次の項目は、2026年9月8〜9日の検証では確認できていません。表中の成功結果やリリースゲート合格から、これらの動作まで保証されたとは判断しません。

- 一般的なVS CodeのPDF拡張からの直接出力。確認済み経路はMMI展開HTML→WeasyPrintです。
- Remote/WSL上の外部アプリ起動。現行実装はこの操作をローカルに限定します。
- OSネイティブの貼付け／ドロップの最終イベント配送。Extension Hostのプロバイダ検査とは区別します。
- Marketplaceでの公開・導入、他OSや別バージョンの実機動作、実顧客の業務成果。

[issue-0100](history/issues/issue-0100-phase11-card-open-button.md)と[issue-0109](history/issues/issue-0109-release-user-experience.md)は、今回の受入条件を満たしたためDoneに更新しました。これを未検証環境への動作保証と解釈しません。

## 再現手順

以下は当時の確認内容を再現するための手順と環境条件です。この文章改善作業で、記載したコマンドを改めて実行したわけではありません。

`03_Implement`で依存関係を導入後、`npm run build`、`npm test`を実行します。Extension Hostは`npm run test:e2e`を使います。今回の実行では、既存のVS Code 1.136.1を`VSCODE_EXECUTABLE_PATH`で指定しました。新しい1.136.2の取得タイムアウトはテスト本体の失敗と分けて記録しています。

```sh
node --import tsx scripts/verify-practical-samples.ts ../04_Documentation/media/release-20260908/sample-verification.json
node --import tsx scripts/render-document.ts ../04_Documentation/samples/practical/10-print.md ../04_Documentation/samples/practical/10-print.html
```

サンプル検査における`errors`は描画エラーブロックの数です。問題パネルに表示された診断の件数とは区別し、後者は実機検証記録で確認します。

### WSLでの日本語フォント

検証環境では次の一時CSSを用意し、`weasyprint -s フォント指定.css 入力.html 出力.pdf`で適用しました。Windowsに游ゴシックがある環境の例です。フォント本体は配布しません。

```css
@font-face {
  font-family: MMIJapanese;
  src: url("file:///mnt/c/Windows/Fonts/YuGothR.ttc");
}
body { font-family: MMIJapanese, sans-serif; }
```

## 配布物

ローカルの`artifacts/local-release`に候補VSIX、教材・ソースZIP、SHA-256付き`distribution-manifest.json`、リリースゲート結果を保存しています。ZIPは未コミット変更を含む作業時点のスナップショットです。インストールするVSIXはZIPと別ファイルです。

### 最終リリースゲート

2026-09-09の最終実行でG1〜G4すべて成功しました。G1はorphan=0 / pending=0、G2は単体テスト、G3/G4はテンプレート・ガイド同期です。詳細は[結果JSON](media/release-20260908/release-gate.json)を参照してください。これはリポジトリが定義した最小ゲートの当時の合格結果であり、上記の未検証範囲やMarketplace公開の完了を意味しません。
