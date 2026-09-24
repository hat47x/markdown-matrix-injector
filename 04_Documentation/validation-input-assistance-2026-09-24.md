# 入力支援機能の検証記録（2026-09-24）

## 判定

補完、案内に沿った参照作成、自然言語による表検索、内容照合、ホバー表示、修正候補などの追加実装を確認した。関連する単体テスト53件は通過した。**現行ソースからの全体ビルドと、VS Code画面での操作確認は完了していない。** この記録は正式リリースの実機検証完了証明ではない。

今回のタスクではComputer Useによる操作を試みたが、このセッションにはスキルが指定する `mcp__node_repl__js` が公開されていなかった。そのため、新機能のスクリーンショットと動画は採取していない。過去の[画像・動画](media/release-20260908/README.md)は2026-09-08時点の基本機能の記録であり、今回の追加機能の動作証拠として扱わない。

## 実施結果

| 対象 | 今回の確認 | VS Code画面での確認 |
| --- | --- | --- |
| 入力位置に応じた補完 | `completionContext.test.ts` を含む関連テストが通過 | 未実施 |
| 案内に沿った参照作成・既存参照の編集 | 実装と利用手順を確認 | 未実施 |
| 日本語の説明による表検索・CPU範囲探索 | `cpuSearch.test.ts` を含む関連テストが通過 | 未実施 |
| クリップボード内容による候補検索 | `contentMatchSearch.test.ts` を含む関連テストが通過 | 未実施 |
| パラメータ誤記の警告と修正候補 | `parameterDiagnostics.test.ts` を含む関連テストが通過 | 未実施 |
| ホバー表示、`Paste As...`、ウォークスルー | 実装と利用手順を確認 | 未実施 |

実行環境はWSLのNode.js v20.20.2、npm 10.8.2。実行コマンド:

```bash
cd 03_Implement
node --import tsx --test test/completionContext.test.ts test/parameterDiagnostics.test.ts test/cpuSearch.test.ts test/contentMatchSearch.test.ts
```

結果は **53件成功、0件失敗**。Windows側の `node_modules` はLinux用 `esbuild` を含むため、Windows Node.js v24.19.0での同コマンドは起動前に失敗した。テスト結果はWSLで得たものだけを採用した。

`npm run build` は5件のTypeScriptエラーで停止した。該当箇所は `src/experimental/worksheetReviewRouteEvaluationPlan.ts`、`test/unifiedHumanReviewViewModel.test.ts`、`test/worksheetFormatFillReviewTelemetryExternalXlsx.test.ts`、`test/worksheetReviewRouteEvaluationPacket.test.ts`、`test/worksheetReviewRouteEvaluationRecordComparison.test.ts`。ビルドが通らないため、現行ソースのVSIXを用いた追加機能のE2E実行には進めていない。これらを修正した後に、全体ビルドと `npm run test:e2e:practical` を再実行する必要がある。

## VS Codeで残る操作確認と撮影項目

操作にはリポジトリ内の[実務サンプル](samples/practical/README.md)を使い、起動した拡張機能のビルド元コミットとVS Codeのバージョンを記録する。各操作で、参照記法だけでなくMarkdownプレビューの表示と原本が変更されないことも確かめる。

1. `![[` を入力してファイルを選び、`#` の後のシート候補、`|` の後の範囲候補、`?mode=` の値候補を表示する。候補の日本語説明と挿入後の記法を撮影する。
2. `MMI: Create or Edit Embed` を実行し、ブック、シート、範囲、表示方法を選ぶ。確認画面と挿入後のMarkdownプレビューを撮影する。既存参照の編集、Escでの中止、Ctrl+Z一回での復元も確認する。
3. `MMI: Find Table by Description` で「状態遷移表のIDと操作を見せて」を入力し、候補と確認画面を撮影する。表現できない集計依頼では理由が表示され、挿入されないことも確かめる。
4. Excelのサンプル範囲をコピーし、`MMI: Insert Embed by Content Match` と `Paste As...` の両方を試す。候補が複数ある場合の説明、選択前に本文が変わらないこと、選択後の参照と表示を撮影する。コピー元の住所と内容の一致は別に検証する。
5. 正しい参照にホバーして表のプレビューと編集リンクを撮影する。`mode=tabel` と `heder=first` を入力し、診断表示と修正候補、修正後のプレビューを撮影する。
6. 拡張機能のウォークスルーと日本語のコマンド名を撮影する。ショートカット `Ctrl+Alt+M` と右クリックメニューから同じ案内画面を開けることを確認する。

スクリーンショットは各手順の**操作前、候補表示、確定後**が識別できる名前で保存する。動画は補完から参照挿入、プレビュー確認までと、内容照合から候補選択までの二本に分け、カーソル操作と結果が読める解像度で収録する。撮影日時、OS、VS Code、VSIX、コミット、サンプルデータの版を添え、各画像・動画をこの記録からリンクする。現時点では新規撮影物がないため、リンク欄は設けていない。
