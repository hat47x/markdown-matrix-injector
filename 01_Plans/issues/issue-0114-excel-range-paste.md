# Issue: Excelのコピー範囲を原本座標のMMI参照として貼り付ける

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: core（ソースモデル・切り出し）/ dx（貼り付け・照合）/ VS Code宿主 / 実機Evidence
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: [ADR-0016](../adr/ADR-0016-notation-first-input-assistance.md)、[ADR-0017](../adr/ADR-0017-windows-clipboard-provenance-bridge.md)、[記法仕様](../../04_Documentation/spec/mmi-notation-v1.md)
- Related Design: [ソースモデル](../../02_Architecture/input-assistance-source-model.md)、[クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)
- Dependency: なし。入力支援の最初の着手対象

## Execution Plan

### Proposed solution

設計はレビュー指摘を反映済み。[設計レビューと作業指示](../input-assistance-design-review.md)のA〜Fを本Issueの作業分割として使う。Openは作業Bへの着手可能を意味し、貼り付け全体の実装許可ではない。

| 順序 | 作業 | 状態 | 止める範囲 |
| --- | --- | --- | --- |
| A | R1〜R5を設計・ADR・観測ハーネスへ反映 | **完了**（下記「Aの完了内容」） | — |
| B | 段1: 原本座標の保持と範囲評価 | **実装完了**（下記「Bの完了内容」） | 未確認の日付表示基準そのものの変更 |
| C | VS CodeのDataTransfer観測 | **完了**（下記「Cの完了内容」） | — |
| D | 内容照合＋明示候補選択の最小貼り付け | **実装完了。実機（VS Code 1.138.0）でe2e確認済み（2026-09-14〜17）。** 形状抽出・値行列抽出・照合アルゴリズム・探索対象ブックの決定・候補選択UI・自動貼り付け統合（`editor.action.pasteAs`）・`extension.ts`配線のすべてを実装。**明示コマンド経路は実e2eで動作確認済み**（この過程で本物のバグを2件発見・修正——`registerTextEditorCommand`の非同期未サポートによりコマンドが実運用でも何も挿入できていなかった、およびe2eテスト自体の期待値が2026-09-14の変更に追従していなかった）。**`editor.action.pasteAs`経路のみ、実クリップボードへの`text/html`設定に必要なツール（xclip等）が本環境に無くe2e未確認**（下記「実VS Code GUI確認」節） | 自動確定 |
| E | 必要な場合だけWindows橋渡し | ADR-0017で判断（選択肢1は却下確定。実装するか否かは未決定） | Dを止めない |
| F | 補完→参照編集→CPU探索 | issue-0110→0111→0115 | FlyHashの採否で基本機能を止めない |

段1（作業B）: 原本座標の保持

疎なセルモデル（`usedRange` / `merges` / `cellAt` / `SourceCell{text,type,value,formula}`）を`workbookLoader`が返し、`sliceRegion(sheet, range)`が住所で矩形を切り出す。`string[][]`は表示直前にのみ作る。読込範囲をA1へ拡張する方式は採らない（実セル1個でも使用範囲の終端まで、観測では3,527,040セルを実体化する）。住所検証→行列数の算術評価→カード/資源上限判定→必要範囲だけ実体化、の順にする（R3）。

段2（作業D/E）: 貼り付け

`DataTransfer`のHTMLから形状（選択断片と親文脈を区別し、rowspan/colspanの占有グリッドを構成）と表示値行列を取り出す。出所は、パスを`SourceURL`から、シート名と住所を`Object Descriptor`の宣言オフセットから取る。R1C1は`R<n>C<n>[:R<n>C<n>]`のみ受け付け、`C<n>:C<n>`・`R<n>:R<n>`と範囲外・逆順は棄却する。取得経路にかかわらず原本と形状・表示値を照合し、照合を通っても初期提供では明示選択を経てから挿入する（R1）。

### Aの完了内容（2026-09-10）

- 設計3文書・ADR-0016/0017へR1〜R5を反映。自動確定を初期提供から外した。
- `summarize.cjs`/`probe-lib.cjs`: `Object Descriptor`を宣言オフセット（`dwSrcOfCopy`=48、`dwFullUserTypeName`=44）から読むよう変更。バッファ全体の文字列検索を廃止。R1C1の数値範囲・逆順検査を追加。
- HTMLの形状をrowspan/colspanの占有グリッドで算出するよう変更。R2の反例（`A(rowspan=2),B` / `C,D` → 2×3）を自己検査として常時実行する。
- `repro-details.cjs`: 日付比較を条件ごとに独立したセルオブジェクトで行うよう修正。旧版は`w`キャッシュを共有し、dateNFなしの結果を誤って報告していた。
- `probe-vscode.ps1`/`ext`: `provideDocumentPasteEdits`が呼ばれない観測を終了コード2の失敗として扱う。貼り付け先を専用のpaste-target文書に固定し、ケースIDを記録する。
- `expected-cases.json`: 13ケースの期待値・環境・ハッシュを固定。絶対パスは`<PROBE>`へ置換。`verify-cases.cjs`で差分検査できる。

### Bの完了内容（2026-09-11、WSL2 Ubuntu / Node v20.20.2で実装・検証）

コード・テストの実体は次のとおり。以下の変更マップと1対1対応する。

- 新規 [`src/core/sheetSource.ts`](../../03_Implement/src/core/sheetSource.ts): `CellRange`/`SourceCell`/`SheetSource`と、CSV用の`sheetSourceFromMatrix`。
- `src/core/workbookLoader.ts`: `WorkbookData.sheets`を`Record<string, SheetSource>`へ変更。XLSX/XMLは`sheet_to_json`をやめ、`!data[row][col]`から直接`SourceCell`を組み立てる（`.w`をそのまま表示文字列に採用。`sheet_to_json({raw:false})`と1件ずつ突き合わせ、書式・日付・エラー値・真偽値すべてで出力が一致することを確認済み。相違点はエラーセルの扱いのみで、これは意図した修正）。`dateNF`の効果範囲をコード上のコメントで正確に記述し直した（書式なし日付には効くが自身の書式を持つセルには効かない）。CSVの`trim()`起因の座標ずれは既知の別問題として明記し、変更していない。
- `src/core/tableGeometry.ts`: `sliceRange(rows,range)`を削除し、`parseRangeToCellRange`・`rangeDimensions`・`measureRegion`（寸法のみ、セル無接触）・`sliceRegion`（矩形実体化）を追加。
- `src/core/smartFallback.ts`: `getWorkbookSelectionMetrics`を`measureRegion`呼び出しへ置換。寸法算出でセルに一切触れないことをテストで保証（`cellAt`が呼ばれたら例外を投げるテスト用`SheetSource`で検証）。
- `src/core/renderTable.ts`: `sliceRegion(sheet, query.range)`へ置換。
- `src/manifest/collectDeliveryManifest.ts` / `src/plugin/markdownMatrixPlugin.ts` / `src/extension.ts`: 型の流れ込みのみで無修正（想定どおり）。

**テスト**: 新規 `test/tableGeometry.test.ts`（19件、純粋関数の単体検証）、`test/workbookCache.test.ts`へ7件追加（非A1起点+空行の完全再現、エラーセル表示、宣言済み結合の取得と非推定の確認、range省略時の使用範囲）、`test/smartFallback.test.ts`へ1件追加（宣言範囲幅が実データ幅より優先されることの回帰）。conformanceコーパスへ1件追加（`fallback-declared-range-width-exceeds-data-to-card`、CSVのみで表現可能な範囲でこの修正を固定）。既存233件は無修正で全件成功、新規25件を加えた258件全成功。`npm run build`・`npm test`（phase9同期チェック含む）を実行し合格。

**実機検証**: 同梱の`04_Documentation/samples/practical/data/design.xlsx`3シートをフルパイプラインで再描画し、range指定あり・省略ありの両方で出力が変化しないことを確認（走査による事前予測と一致）。旗艦の再現ケース（`設計.xlsx#状態遷移|C5:F12`、C5起点・9行目空行・先頭ゼロ・日付・数式・エラー値混在）を実際の`markdownMatrixPlugin`経由でレンダリングし、設計文書が示す正しい8行×4列（空行を含む・`#DIV/0!`表示）と完全一致する出力を確認済み。

**未対応で残る点**（正直な区分）:
- `mode=table`で強制された場合のサイズ上限は**実装済み（2026-09-14、下記「`mode=table`強制時のサイズ上限」節）**。構造化された診断コードは**2026-10-02に `MMI_TABLE_TOO_LARGE` として実装済み**。明示 `range` + `mode=table` はセルを読まずにProblemsへ事前表示し、レンダリング時も同じコードをpreview HTMLの `data-code` に保持する。**同日、表の実体化・変換・HTML化が期限を自ら確認して中断できる協調型time-budget基盤も追加した**（`MMI_TABLE_TIME_BUDGET_EXCEEDED`）。ただし本番の既定時間値はまだ設定せず、SheetJSの同期parseや単一の遅い`cellAt`を外からpreemptする厳密な壁時計タイムアウトは未実装のまま。
- 読込み・モデル構築の**分離計測ハーネスは2026-10-02に追加済み**。`loadWorkbookFromBytes()` を本番ローダーから切り出し、`npm run bench:workbook-load` で `initialReadMs` / warm read / bytes→decode・parse・`SheetSource`構築 / WorkbookCacheなしend-to-endを別々に記録する。既定入力は同梱 practical data、任意ファイル/ディレクトリと反復回数も指定可能。**ただしOSページキャッシュは制御しないため `initialReadMs` を「cold cache」とは呼ばない。Windows実機でOS-cold条件を含む数値取得は未実施**。参考値として、2026-09-16の内容照合バッチでは実サンプル30ファイル平均の`loadWorkbook`がJITウォームアップ後おおむね1ms未満〜数msだった。
- CSVの`trim()`起因の座標ずれは、コードコメントで明記したのみで実装は変更していない（別問題として意図的に対象外）。
- ユーザーへの表示挙動変更の確認（空行保持・エラーセル表示）は、走査結果（該当0件）を提示したのみで、実際の確認は未取得。

### `mode=table`強制時のサイズ上限（2026-09-14）

[ソースモデル設計](../../02_Architecture/input-assistance-source-model.md)§3「`mode=table`で強制された場合も上限を外さない。超過は記法仕様P2に沿う可視エラーとする。」を実装した。`evaluateSmartFallback`（`src/core/smartFallback.ts`）の`mode=table`分岐は、これまで閾値判定を完全にバイパスしていた——`getSmartFallbackDecisionAfterLoad`が実際の範囲寸法（`measureRegion`で算出、セル無接触）を渡しても、明示`mode=table`であれば無条件に`table`判定を返し、`renderTable.ts`の`sliceRegion`が制限なく実体化していた。

- **`MAX_CELLS_HARD_LIMIT`（10万セル）を新設し、`mode=table`分岐だけに適用した。** 自動判定（`mode`省略）と`mode=card`は、`MAX_CELLS_BEFORE_CARD`（500セル）で既にカードへ落ちるため`sliceRegion`まで到達せず、この上限は不要（対象外）。超過時は`Error`を投げる——記法仕様P2「可視のエラー表示（`mmi-error`ブロック）」は`markdownMatrixPlugin.ts`の`renderEmbed`が既に持つ包括的catchでそのまま満たされる（新規の配線は不要だった）。
- **上限値は暫定値。** 実測パフォーマンスデータが無い状態で選んだプレースホルダであり（読込み自体の時間計測は別途未実施のまま残っている）、実機計測の結果次第で調整が必要。
- **構造化診断は2026-10-02に追加。** `mode=table` の10万セル上限超過は `SmartFallbackLimitError(code='MMI_TABLE_TOO_LARGE')` としてcoreから伝播し、明示範囲ならProblemsでも同じコードを事前表示、previewでは `data-code="MMI_TABLE_TOO_LARGE"` を出す。範囲省略時はused rangeが読込み後に確定するためProblemsの事前判定対象外だが、レンダリング時のcoded errorは維持される。**協調型の時間予算基盤は2026-10-02に実装済み**。`sliceRegion`、columns/transpose/grep、HTML化の各bounded loopが同一budgetを消費し、超過時は`MMI_TABLE_TIME_BUDGET_EXCEEDED`で中断できる。previewにはembed単位のbudget factoryを注入できる。ただし**本番既定値は未設定**で、SheetJS同期parseや単一の遅い`cellAt`を強制終了するstrict wall-clock timeoutは別途worker/process境界が必要。

**テスト**: `test/smartFallback.test.ts`へ3件追加（`mode=table`が上限超過で例外を投げる、上限境界（10万セルちょうど）ではtableのまま、`shouldRenderAsCardAfterLoad`が`cellAt`を一切呼ばずに例外を伝播することを`cellAt`が例外を投げる`SheetSource`で確認）。`test/markdownMatrixPlugin.test.ts`へ1件追加（宣言範囲のみで10万セルを超えさせ、実際に`mmi-error`が描画されることをプラグイン経由で確認）。`npm test`は343件全成功。

### CSVの座標ずれ（trim）の影響範囲調査（2026-09-15）

`workbookLoader.ts`の`parseCsv`は、ファイル全体へ`.trim()`を適用してから解析する（コード自身のdocコメントが既に明記済みの既知のギャップ。[ソースモデル設計](../../02_Architecture/input-assistance-source-model.md)§7）。先頭に空行がn行あると、A1原点の前提がn行ずれる（`\n\nName,Role\n...`のようなファイルで、`Name,Role`が本来のA3ではなくA1として扱われる）。

この修正自体は行っていない。 修正するかどうかは、CSVにもXLSXと同じ「原点保持」契約を広げるべきかという製品判断であり（手編集CSVの先頭空行はただの整形ノイズかもしれず、Excelの`usedRange`のように権威ある値とは限らない）、本セッションの一存で決めない。ここで行ったのは、issue-0114が求めていた前段の調査——「既存の空行処理・自動範囲・見出し解釈に依存するテストを先に洗い出す」——のみ。

- 調査結果: 先頭空行のtrim挙動に依存する既存テストは0件。 `test/csvEncoding.test.ts`・`test/workbookCache.test.ts`・`test/markdownMatrixPlugin.test.ts`・`test/conformance/cases.json`のCSVフィクスチャを全数確認したが、先頭が空行のものは存在しなかった。つまり、将来この挙動を変更しても既存テストは1件も壊れない——ただし、これは「安全」の証明ではなく「今のところ誰も検証していない」という意味であることに注意。
- 現状挙動をピン留めするテストを1件追加した。 `test/workbookCache.test.ts`に、先頭2行が空行のCSVを解析すると原点がずれること（`Name,Role`がA1として扱われる）を検証するテストを追加した。これにより、将来`parseCsv`を変更した際、それが事故ではなく明示的な判断になる。

**テスト**: `test/workbookCache.test.ts`へ1件追加（現状のtrim挙動のピン留め、コメントで既知の未修正ギャップと明記）。`npm test`は344件全成功。

### Cの完了内容（2026-09-11、VS Code 1.137.0・ローカル・Windows実機）

結論: `DataTransfer`に出所形式は含まれない。原本のパスもシート名・住所も取得できない。 これで[ADR-0017](../adr/ADR-0017-windows-clipboard-provenance-bridge.md)の選択肢1（拡張内だけで完結）は却下が確定した。

実施内容は次のとおりです。

- 隔離VS Code（専用`--user-data-dir`/`--extensions-dir`）へ観測用拡張を読み込み、実Excelから`状態遷移!C5:F12`をコピーして`editor.action.clipboardPasteAction`コマンド経由で貼り付けを実行させた。`provideDocumentPasteEdits`が実際に呼ばれたことをログで確認（活性化だけを合格にしない、というレビューR5の条件を満たす）。
- 観測されたMIME型は`text/plain`・`text/html`・`text/rtf`・`image/png`の4件のみ。`Link`・`Object Descriptor`・`Csv`・`XML Spreadsheet`・`Hyperlink`・`SymbolicLink`・`Link Source Descriptor`を明示的に`pasteMimeTypes`へ登録したが一切現れなかった。
- `text/html`の内容を`containsSourceUrlMarker`／`containsCfHtmlVersionMarker`で検査し、いずれも`false`。OSクリップボードの生バイトに存在する`SourceURL:`・`Version:1.0`ヘッダーは、VS Code／Electronのクリップボード正規化で失われている。

観測ハーネスの不具合を2件発見・修正した（前回セッションの実装に残っていたもの）:

1. `ext/extension.js`が`pasteMimeTypes: ['*']`を宣言していたが、VS Codeはこれを「任意のMIME型」とは解釈しない（公式サンプル`microsoft/vscode-extension-samples/document-paste`と本リポジトリの実装[extension.ts](../../03_Implement/src/extension.ts)`PASTE_MIME_TYPES`はいずれも具体的なMIME文字列を列挙している）。`'*'`はどの型にもマッチせず、`provideDocumentPasteEdits`が一度も呼ばれなかった。この不具合により、当初は「出所形式が存在しない」という誤った結論に到達しかけた。 具体的なMIME文字列の列挙へ修正し、再現できることを確認した。
2. `probe-vscode.ps1`が`ConvertTo-Json | Out-File -Encoding utf8`で書き出す`trigger.json`にBOMが付与され（Windows PowerShell 5.1に`utf8NoBOM`オプションが無いため）、拡張側の`JSON.parse`が例外を投げていた（`caseId`が失われ`"unknown"`になる形で握りつぶされ、貼り付け自体は動いていたため見逃しやすい）。拡張側でBOM除去してから`JSON.parse`するよう修正した。
3. `probe-vscode.ps1`自体もUTF-8 BOM無しで保存されており、Windows PowerShell 5.1がシステムANSIコードページとして読み込んで日本語ファイル名・シート名が文字化けしていた（ハーネスREADMEが警告している既知の落とし穴に、ハーネス自身が引っかかっていた）。BOMを復元した。

**未確認のまま残る点:**
- 宣言している最低対応版（VS Code `^1.96.0`）での再現。今回は現行版（1.137.0）のみ。
- 実キー入力（Ctrl+V）とコマンド経由貼り付けの経路一致。任意のウィンドウへキー入力を注入するリスクを避けるため（レビューR5がSendKeysベースの旧設計を退けた理由と同じ）、意図的に未検証。VS Codeの既定キーバインドはCtrl+Vを同一コマンドへ割り当てているため経路は同一と考えるが、実測ではない。

詳細は[クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)§2、再現手順は[観測ハーネス](../../03_Implement/scripts/clipboard-probe/README.md)。

### `pasteDrop.ts`の不具合修正（2026-09-11、作業Cで採取した実データにより発見）

作業Cで採取した実際のクリップボードペイロードを、合成HTMLではなく製品コード（`src/dx/pasteDrop.ts`）へそのまま通して確認した結果、現行の`suggestEmbedFromClipboardHtml`は実際のExcelコピーに対して壊れた提案を生成していた。

`extractSupportedFilepathFromHtml`はHTML全文から`.xlsx`/`.xls`/`.csv`/`.xml`で終わる文字列を無条件に探すが、実Excelの`<head>`には常に次の2つの`<link>`（Microsoft HTMLクリップボード形式の一時ステージング参照。原本ではない）が含まれる。

```html
<link id=Main-File rel=Main-File href="file:///.../msohtmlclip1/01/clip.htm">
<link rel=File-List href="file:///.../msohtmlclip1/01/clip_filelist.xml">
```

2つ目が`.xml`で終わるため誤って一致し、実際に採取したペイロードでは次の壊れた提案が生成されることを確認した。

```
![[C:/Users/.../AppData/Local/Temp/msohtmlclip1/01/clip_filelist.xml|A1:D8]]
```

原本ワークブックではなく一時ステージングファイルを指しており、かつA1起点仮定も誤り。原本ワークブックのパスは実データのどこにも存在しない（HTML全文を走査して確認済み）ため、これはExcelコピーの主要な実使用ケースで常に発生する。

修正済み。 `extractSupportedFilepathFromHtml`が`<head>`を検索対象から除外し、`msohtmlclip`を含む一致も除外するよう変更した。修正後、実データを与えると`suggestEmbedFromClipboardHtml`は`null`（提案なし、通常貼り付けへ委ねる）を返すことを確認した。既存のsynthetic HTMLテスト（`<div data-sheet="...">`形式）は`<head>`を使っていないため無影響。回帰テストを2件追加（実キャプチャの`<head>`構造を再現したケース）。`npm test`は260件（既存258件＋新規2件）全成功。

**この発見が示すこと:** `suggestEmbedFromClipboardHtml`が抽出する3項目（パス・シート名・範囲）のうち、**パスの抽出は積極的に誤っており**、シート名（`<title>`/`data-sheet`頼み）は実データでは常に`undefined`（実害はないが無意味なコード）、範囲はA1起点の既知の誤り。**現行のクリップボードHTML解析は、実際のExcelコピーに対して正しい結果を1つも生成できない設計だった。**

### `pasteDrop.ts`のシート名・範囲推測の撤去と占有グリッドの移植（2026-09-14）

上記の発見を受け、残る2つの不正確な推測（シート名・範囲）も撤去した。

- `extractSheetNameFromHtml`（`<title>`/`data-sheet`からの推測）を削除した。 実データでは常に`undefined`を返す無意味なコードであり、[出所設計](../../02_Architecture/input-assistance-paste-provenance.md)§6が採用しない方針を明記済みだった。
- `inferRangeFromHtmlTable`（HTMLの行列数からA1起点の範囲を生成する関数）を削除し、`extractHtmlTableShape`に置き換えた。 新関数は行数×列数の形状のみを返し、開始位置は一切生成しない。列数の算出も、結合セルの占有グリッド方式（[設計レビュー](../input-assistance-design-review.md)R2）へ置き換えた——旧実装は行ごとのセル数の最大値を取るだけで、縦結合（rowspan）を挟むと列数を過小評価する反例が存在した（1行目「A(rowspan=2), B」・2行目「C, D」は各行2セルだが真の列数は3）。この反例をテストとして固定した。
- `suggestEmbedFromClipboardHtml`は、もはや`sheet`・`range`を一切返さない。 出所の一部（ファイルパスのみ）が確認できた場合に`![[file.xlsx]]`（ファイルのみ）を提案し、シート・範囲は利用者の補完（issue-0110）に委ねる。パスも確認できなければ`null`（提案なし、通常貼り付けへ委ねる）を返す。
- `extractHtmlTableShape`は独立してエクスポートされているが、現時点ではどこからも呼ばれていない。 内容照合（issue-0114作業D本体、まだ未着手）が原本データとの照合に使う想定の部品として先行実装した。

**影響したテスト:** `test/pasteDrop.test.ts`の既存アサーション（`sheet:`/`range:`フィールドと`#Sheet|Range`形式のmarkdown文字列を期待していたもの）と`test/extensionIntegration.test.ts`の4箇所を新契約（filepath-onlyの`![[file]]`）へ更新した。`inferRangeFromHtmlTable`の既存2テストを`extractHtmlTableShape`の4テスト（行×列カウント、広い表、rowspan反例、フラグメント外`<tr>`）へ置き換えた。実キャプチャ（C5:F12、9行目空行）でも`extractHtmlTableShape`が正しく`{rowCount: 8, columnCount: 4}`を返すことを確認済み。

### `parseTsv`の追加 — 表示値行列の抽出（2026-09-14）
**2026-10-02 表示空白の完全一致修正**: `parseTsv()`には非引用セルだけ`field.trim()`する処理が残っていた。出所設計は最終比較で空白を同一視しないため、これは` padded `と`padded`を取り違える契約違反になる。Excelはタブや改行が無ければ前後空白だけではセルを引用しないため、引用の有無にかかわらずTSV構文を除いたセル文字列をそのまま保持するよう変更した。空白付きと空白なしの同値候補を同じシートに置き、空白付きコピーが正しい行だけへ一致する回帰を追加した。


**2026-10-02 空端セルの偽陰性修正**: `parseTsv()` とDataTransfer読取りが `.trim()` を使っていたため、コピー矩形の先頭/末尾TAB（=空の先頭/末尾セル）が消え、列数と物理rangeを縮めていたことを確認した。`text/plain` は生payloadを保持し、TSV parserはExcelが付ける末尾の行区切り1個だけを構造文字として除去する。先頭/末尾TABと、`\t\r\n` で表される意図的な空行は保持する。DataTransfer、parser、content-match統合の3層で回帰を追加した。


内容照合（[出所設計](../../02_Architecture/input-assistance-paste-provenance.md)§4/§5）には、形状（`extractHtmlTableShape`）に加えて実際のセル値が要る。`text/plain`（TSV）から値行列を取り出す`parseTsv`を追加した。

実機で引用規則を検証してから実装した（推測しない）。

- タブ・改行を含むセルだけが引用符で囲まれる（`workbookLoader.ts`のCSVパーサーと同じRFC4180風の規則、区切り文字がタブ）。
- 裸の引用符だけでは引用が発生しない。 `say "hi"`はタブ・改行が無ければ無加工のまま出力される——厳密なRFC4180より緩い、Excel固有の挙動として確認した。
- 引用が発生する場合、内部の引用符は`""`で二重化される（`"a<TAB>b say ""hi"""`）。
- セル内改行は裸のLF、行区切りはCRLF。

実キャプチャ（C5:F12）で`parseTsv`が`extractHtmlTableShape`（`text/html`由来、8行×4列）と一致する8行×4列の値行列を返すことをクロス検証した。既存の`test/csvEncoding.test.ts`とは無関係（CSVパーサー自体は変更していない）。

`test/pasteDrop.test.ts`では、基本分割、実キャプチャ再現、タブ引用、改行引用、引用符エスケープ、裸引用符、境界空セル、空白保持を回帰として扱う。過去の`trim`前提は2026-10-02に撤去した。

### `findContentMatches`の追加：内容照合アルゴリズム本体（2026-09-14）

2026-10-02に偽陰性を修正した。旧実装では`maxCandidates`を完全一致の検証前に適用し、候補原点を先頭N件で切っていた。このため、頻出アンカーから偽候補が多数生じると、真の一致がN+1件目以降に隠れる。上限は「返す完全一致数」に移し、候補原点を順に検証するよう変更した。回帰テストでは`anchor|wrong`を205行並べ、その後ろにだけ`anchor|target`を置き、この条件を固定した。これにより、重複結果数の上限を維持しつつ、アンカーの出現頻度だけを理由に「一致なし」と誤判定しない。

形状を表す`extractHtmlTableShape`と、値行列を返す`parseTsv`が揃ったため、[出所設計](../../02_Architecture/input-assistance-paste-provenance.md)§5「内容照合」の手順2〜4を`src/core/contentMatch.ts`の`findContentMatches(sheet, needle, options?)`へ実装した。対象はアンカー選定、転置索引による候補抽出、複数アンカーの突き合わせ、矩形全体の照合である。

- **入力**：検索対象の`SheetSource`1枚と、`parseTsv`などが返す貼り付け値行列`string[][]`。
- **出力**：完全一致した矩形の一覧`{ range: CellRange }[]`。部分一致は候補にしない。同一内容が複数箇所にある場合は、返却上限の範囲で一致をすべて返す。候補が複数ある場合は必ず一覧提示し、自動で1件へ絞り込まない。
- **アルゴリズム**：検索値行列`needle`の非空セルから、原本での出現回数が最も少ない値をアンカーに選ぶ。原本の使用範囲を1回走査して作った転置索引から出現位置を取得し、希少なアンカー最大4件で候補原点を絞り込む。総当たり走査は行わず、生き残った候補だけ矩形全体を実際に読んで照合する。
- **上限**：`maxIndexedCells`は既定20万セル、`maxCandidates`は既定200件とする。2026-10-04には詳細結果を追加した。200件に達しただけでは打ち切りとみなさず、201件目の完全一致を確認した場合だけ`truncated=true`とする。これにより、ちょうど200件の完全な候補集合と、201件以上あるため200件へ切り詰めた候補集合を区別できる。
- **この時点で意図的に含めなかったもの**：探索対象ブックの決定、候補選択UI、`extension.ts`への配線。3点とも2026-09-15に実装した。詳細は後述の「作業D：内容照合コマンドの実装」を参照する。

`test/contentMatch.test.ts`には11件のテストを追加した。単一一致、非A1原点での物理座標保持、不一致、内容重複時の候補返却、部分一致の棄却、全セルが空の検索値行列の早期終了、検索値行列がシートより大きい場合の早期終了、使用範囲外の候補を除外してクラッシュしないこと、`maxIndexedCells`超過時の例外、`maxCandidates`による上限処理を検証する。当時の`npm test`は339件すべて成功した。

### 作業D：内容照合コマンドの実装（2026-09-15）

`findContentMatches`、`extractHtmlTableShape`、`parseTsv`が揃ったため、issue-0114で残っていた探索対象ブックの決定、候補選択UI、`extension.ts`への配線を実装した。

- 新規に[`src/dx/contentMatchSearch.ts`](../../03_Implement/src/dx/contentMatchSearch.ts)を追加し、複数のワークブックとシートを横断して内容照合を集約した。`findWorkbookContentMatchesDetailed`は、完全一致、`skippedSheets`、`truncatedSheets`を分けて返す。`maxIndexedCells`超過は`MMI_CONTENT_MATCH_SHEET_TOO_LARGE`として扱う。候補上限を超えた場合は、検索済みだが候補集合が切り詰められた状態として保持する。その他の予期しない例外は握りつぶさない。
- `src/core/tableGeometry.ts`に`indexToColumn`と`cellRangeToA1`を追加した。`columnToIndex`と`parseRangeToCellRange`の逆変換にあたり、物理座標からA1文字列へ戻す。内容照合の結果をMMI記法へ変換するために必要な処理である。
- `src/extension.ts`に`insertEmbedByContentMatch`と新規コマンド`markdownMatrixInjector.insertEmbedByContentMatch`（`MMI: Insert Embed by Content Match`）を追加した。
  - **探索対象ブックの決定（§5手順1）**：`vscode.workspace.findFiles(WORKBOOK_FILE_GLOB, ...)`で候補を列挙し、編集中のMarkdownが属するワークスペースフォルダ内だけを採用する。2026-10-03には、`startsWith(workspaceRoot)`による文字列比較を廃止し、記法P4と同じ`isPathWithinBoundary()`と`realpath`による検査へ統一した。これにより、マルチルートワークスペースで`work`と`work-old`のようにパスの接頭辞が一致していても、別のルートを探索しない。ワークスペース内のシンボリックリンクが外部ファイルを指す場合も除外する。
  - **候補選択UI（§4「自動確定の規則」）**：結果が1件でも複数件でも、必ず`vscode.window.showQuickPick`を経由する。VS Code標準の明示選択UIを使い、独自UIの実装を避けた。Escでキャンセルした場合は何も挿入しない（R1）。
  - ブックを読めない場合、シートが索引上限を超える場合、候補上限によって完全一致が切り詰められた場合、または探索対象ブックが500件上限を超えた場合は、候補集合を不完全として扱う。0件でも「一致なし」と断定しない。候補がある場合は、明示コマンドで警告し、Paste Asでは各候補に「検索不完全」と表示する。索引上限以外の予期しない照合エラーは利用者に表示し、MMIの候補は返さない。

`test/contentMatchSearch.test.ts`には6件、`test/tableGeometry.test.ts`には`indexToColumn`と`cellRangeToA1`の3件を追加した。`test/extensionIntegration.test.ts`には構造テストを追加した。

### 作業D続き: 自動貼り付け（Ctrl+V）への統合（2026-09-16）

前節では「自動貼り付けには統合せず、別コマンドとする」という設計判断をしていたが、この機能は元々自動貼り付けへの統合を目的として作られたものであり、統合できない理由があるなら解消すべきという指摘を受け、前節の判断を見直した。

見直した結果、2つの懸念は両方とも解消できることが分かった。

1. 性能懸念（「毎回ワークスペース全体スキャンが走る」）は実測で否定された。 本セッションで2026-09-16に実測した。`/mnt/c`（WSL2からWindowsファイルシステムへの9pブリッジ）はVS Code拡張ホストの実際の実行環境（ネイティブWindows、またはWSLリモート開発でのネイティブLinuxファイルシステム）を代表しないため、ネイティブファイルシステム（`/tmp`）へ複製して計測した。
   - 本リポジトリの実サンプル30ファイル（`.xlsx`/`.csv`/`.xml`混在）: 読込み+検索の定常状態で約18〜20ms。
   - 10倍の300ファイルへ複製: 定常状態で約65〜140ms。
   - ワークスペース内ファイル数に対してほぼ線形にスケールし、実用的な規模（数十〜数百ファイル）では体感できない範囲に収まる。「毎回無言でスキャンが走る」という当初の懸念は、実測データが無いまま悲観的に見積もっていたことが原因だった。
2. `showQuickPick`が自動貼り付けのコールバック中に使えない、という制約は、そもそも統合先が違っていた。 VS Codeの`DocumentPasteEditProvider`は`provideDocumentPasteEdits`から複数の`DocumentPasteEdit`を返せる。挙動は呼び出し契機（`context.triggerKind`）で異なる。
   - **`Automatic`（通常のCtrl+V）**: 複数の候補が返っても、最初の1件が即座に自動適用され、他候補へ切り替えるための小さなウィジェットが貼り付け後に表示される（「先に挿入、後から切り替え可能」という順序）。ここへ内容照合の候補を混ぜると、未確認の推測が自動的に本文へ入ってしまい得る——R1（自動確定しない）に反するリスクがある。
   - **`PasteAs`（`editor.action.pasteAs`、既定ではCtrl+.）**: VS Code公式ドキュメントの記述どおり「挿入される前に、貼り付け方法を選ぶためのドロップダウンが表示される」——選んでから挿入する順序。これはR1が要求する「明示選択を経てから挿入する」を、自前のUIを実装せずにVS Code標準機能だけで満たせる。

**実装**: `provideDocumentPasteEdits`（`registerNativePasteProvider`内）で`context.triggerKind === vscode.DocumentPasteTriggerKind.PasteAs`の場合のみ、内容照合の候補（`getContentMatchPasteEdits`）を追加で返すようにした。通常のCtrl+V（`Automatic`）の挙動は一切変更していない。

- **`getContentMatchPasteEdits(document, dataTransfer, token)`**: `dataTransfer`の`text/plain`（TSV）を使って`findWorkbookContentMatches`を呼び、一致ごとに`DocumentPasteEdit`を1つ返す（複数一致ならVS Codeの標準ドロップダウンに複数項目として並ぶ）。
- **`looksLikeTabularClipboard(plainText)`**: 単語1つ・URL1つのような単一スカラー値の貼り付けでは、`vscode.workspace.findFiles`にすら到達しない（無駄なワークスペース走査をしない）。`parseTsv`した結果が2セル未満（1行1列）なら即座に`[]`を返す。
- **`MAX_CONTENT_MATCH_WORKSPACE_FILES`（500件、暫定値）**: 病的に大きいワークスペース（数千ファイル）に対する安全弁。実測では数百ファイルまで問題にならないと分かっているため、実運用で狭すぎると分かれば引き上げる前提。
  - **2026-10-02改善**: `findFiles()`の列挙順へ依存したまま先頭500件を切ると、実際のコピー元が501件目以降なら完全一致でも探索不能になるため、上限適用前にMarkdown文書からのディレクトリ距離で決定論的に並べる。まず同一ディレクトリ、次に近い子/兄弟階層を優先し、同距離は正規化パスで安定化する。上限値や完全一致判定、自動確定禁止は変更しない。500個の遠い候補の後ろに列挙された近傍ブックが上限内へ残る回帰テストを追加した。
  - **2026-10-03境界修正**：500件上限は、ワークスペース境界を実パスで確認した後に適用する。境界外の候補が上限を消費して、正当な候補を押し出さないようにした。パスの接頭辞だけが一致する別ルート、外部を指すシンボリックリンク、境界検査後の件数上限を回帰テストで固定した。
  - **2026-10-04完全性修正**：500件に達しただけでは検索不完全とみなさない。境界内に501件目のブックが実際に存在することを確認した場合だけ、探索対象が切り詰められた状態として保持する。明示コマンドとPaste Asはこの状態を既存の「検索不完全」表示へ含める。これにより、501件目以降を検索していない場合に「一致なし」や完全な候補集合と誤認させない。
- **`CancellationToken`を尊重する**: `provideDocumentPasteEdits`が受け取る`token`を`loadWorkspaceWorkbooksForContentMatch`のファイル読込みループへ渡し、キャンセルされたら即座に打ち切る（ユーザーがEscを押す、別の編集を始める等でVS Codeがリクエストをキャンセルし得るため）。
- 既存の明示コマンド（`insertEmbedByContentMatch`）は維持した。貼り付け操作を経由せず「クリップボードに今ある内容で検索したい」場合に使える、独立した価値がある。

含んでいないもの（今後の検討課題）は次のとおりです。
- 候補一覧の文脈表示を改善（2026-10-02）。 明示コマンドでは既存どおり、一致を含む表の表題・見出し・直前/直後の行を表示する。加えて`Paste As`の1行候補にも、同じ`MatchContext`から `表 / 見出し / 前 / 後` を最大72文字へ圧縮した短い文脈を表示するようにした。改行・連続空白を正規化し、各行は先頭3セル・1セル18文字まで、全体も上限付きとする。これにより同じ値が複数箇所へ存在しても、ファイル#シート＋範囲だけより選び分けやすい。なおコピーした値そのものの先頭数行プレビューはまだ表示しない。候補は引き続き「コピー元を確認済み」または「内容から推定」と明示し、自動確定規則は変更しない。
- `editor.action.pasteAs`経路のみ、実VS Code GUIでの動作確認が未実施。 理由は下記「実VS Code GUI確認」節（実クリップボードへ`text/html`を設定する手段が本環境に無い）。明示コマンド経路（`insertEmbedByContentMatch`）は実e2eで動作確認済み（2026-09-17）——`showQuickPick`をテストコード内で一時的に差し替えて駆動し、実ワークスペースの実ファイルに対する検索から挿入までの全パイプラインを実証した。この過程で`registerTextEditorCommand`の非同期未サポートという本物の実装バグを発見・修正した（詳細は下記節）。

**テスト**: `test/extensionIntegration.test.ts`へ構造テストを追加・更新（`providedPasteEditKinds`の変更、`PasteAs`ゲートの存在、`looksLikeTabularClipboard`によるゲート、キャンセル伝播の3箇所）。`npm test`は355件全成功。加えて2026-09-17、`test/e2e/suite/extensionHost.test.ts`に実e2eステージ`content-match-standalone-command`を追加し、実VS Code上での動作を確認した（下記「実VS Code GUI確認」節）。

### 実VS Code GUI確認（2026-09-16〜17、xvfb不要でe2e実行に成功）

2026-09-16時点では、xvfbのインストールがsudo認証キャッシュ失効により完了できなかった（下記「2026-09-16の試行記録」に経緯を残す）。2026-09-17、この開発環境（WSL2）には元からWSLgによる実表示（`DISPLAY=:0`・`WAYLAND_DISPLAY=wayland-0`・`/tmp/.X11-unix/X0`）が提供されていることが判明し、xvfb自体が不要だった。

`test/e2e/runTest.ts`のヘッドレス前提条件チェック（`headlessEntryCondition.hasDisplayEnv || headlessEntryCondition.underXvfbHarness`）は`DISPLAY`/`WAYLAND_DISPLAY`環境変数の存在だけで満たされる。`scripts/run-vscode-e2e.sh`のxvfb-runラッパーを経由せず、次のコマンドを直接実行するだけで実VS Code Extension Hostが起動しテストが走ることを確認した。

```bash
cd 03_Implement
MMI_ENABLE_TEST_COMMANDS=1 node --import tsx ./test/e2e/runTest.ts
```

**実行の結果、実VS Code（1.138.0、キャッシュ済みインストール利用）上で以下が確定した:**

- ネイティブ貼り付け／ドロッププロバイダの登録（`hostSupportsPasteProvider`/`registeredPasteProvider`等すべて`true`）。
- issue-0010の受入基準（プロバイダ登録面・フォールバック互換性・共有ロジック再利用）すべて成功。
- **内容照合コマンド（`MMI: Insert Embed by Content Match`）の全体パイプラインを実データで実証**——クリップボードのTSV値`"Alice\tAdmin"`を実ワークスペースの実ファイル（`data/roles.csv`）に対して検索し、`![[../data/roles.csv#Sheet1|A2:B2]]`が正しく挿入されることを確認（`vscode.window.showQuickPick`はテストコード内で最初の項目を自動選択するよう一時的に差し替えて駆動——テストとエクステンションは同一のExtension Hostプロセス内で同じ`vscode`モジュールを共有するため、この差し替えは実際のコマンド実行に対して有効）。

**この過程で実際のバグを2件発見・修正した（テストの不備ではなく、いずれも本物の欠陥）:**

1. `test/e2e/suite/extensionHost.test.ts`の期待値が2026-09-14の変更に追従していなかった。 `PASTE_FALLBACK_EXPECTED_INSERT`・`NATIVE_PASTE_EXPECTED_INSERT`が旧契約の`#Summary|A1:B2`形式のままで、2026-09-14に撤去したはずのシート名・範囲推測を期待し続けていた。e2eが本環境で一度も成功実行できていなかったため、これまで検出されなかった。`![[...]]`（filepathのみ）へ修正。
2. `insertEmbedByContentMatch`の登録方法が誤っていた（本物の実装バグ）。 `registerTextEditorCommand`は非同期コールバックをサポートしない（VS Code既知の制約、microsoft/vscode#178931・#2933・#16814・#90834）——`editor`/`edit`引数は同期区間でのみ有効で、`executeCommand`はコールバックが返すPromiseを一切待たない。実際に実e2eで観測したのは「コマンドは開始するが、最初の`await`（クリップボード読込み）以降が孤立し、`executeCommand`は即座に解決、ドキュメントは変化しない」という挙動——つまりこのコマンドは実運用でも常に何も挿入できなかった可能性が高い。 `registerCommand`（引数なし、`vscode.window.activeTextEditor`を関数内で自前解決）へ変更し、最終編集の直前にも`activeTextEditor`を再解決するよう修正した（非同期区間中にフォーカスが変わっている可能性への防御）。

**未確認のまま残る点**: `editor.action.pasteAs`（Ctrl+.）統合のe2e確認はまだ行っていない。この経路は実OSクリップボードが`text/html`を持つ必要があり（`vscode.env.clipboard`はプレーンテキストのみ設定可能）、本環境には`xclip`/`wl-copy`等が無く、sudoでの追加インストールもできない（前回と同じ認証キャッシュ失効の制約）。

### 2026-09-16の試行記録（xvfbが不要と判明する前の経緯）

1. WSL2 Ubuntuに`xvfb`と関連するElectronランタイム依存（`libgtk-3-0`・`libnss3`・`libxkbcommon0`・`libasound2t64`・`libgbm1`）が未導入だったため、`sudo apt-get install`で導入を試みた。
2. 1回目の試行はバックグラウンドで実行したが、セッション区切りをまたいで孤児化し、完了しないまま終了した。
3. 2回目の試行はユーザーの指示により中断した。
4. 3回目の試行で、1回目の孤児化したプロセスと3回目のプロセスの両方が`apt`/`dpkg`ロックを巡って膠着した（互いに待ち合い、CPU使用率0%で停止）。
5. 膠着したプロセスを`sudo kill`で終了させようとしたが、この時点でsudoの認証キャッシュが失効しており、パスワード入力が必要になった。本セッションは対話的にパスワードを入力する手段を持たないため、これ以上の対処ができなかった。

翌日（2026-09-17）、`echo $DISPLAY`でWSLg由来の実表示が既に存在すると判明し、xvfb導入自体が不要だったことが分かった。次にこの種の環境でe2eを試す際は、まず`echo $DISPLAY; echo $WAYLAND_DISPLAY`を確認し、既存の表示があればxvfbのインストールを試みる前に直接`node --import tsx ./test/e2e/runTest.ts`を実行すること。

### 作業Bの変更マップ

コードを照合して作成した。着手前にこの表と実際の差分を突き合わせる。

| ファイル | 現状 | 変更 |
| --- | --- | --- |
| `src/core/workbookLoader.ts` | `WorkbookData{sheets: Record<string, string[][]>}`を返す | 原本座標を保つ`SheetSource`（`usedRange`/`merges`/`cellAt`/`SourceCell`）を返す。`string[][]`は生成しない |
| `src/core/tableGeometry.ts` | `sliceRange(rows, range)`が配列のA1起点を前提にする | `measureRange(range)`（寸法のみ・セルに触れない）と`sliceRegion(sheet, range)`（矩形を実体化）に分ける |
| `src/core/smartFallback.ts` | `getWorkbookSelectionMetrics`が`sliceRange`を呼んで寸法を得る | `measureRange`だけを使う。**判定のために実体化しない**（R3の要） |
| `src/core/renderTable.ts` | `query.range ? sliceRange(rows, range) : rows` | カード判定を通過した後に`sliceRegion`を呼ぶ。矩形が保証されるので行長のばらつき対策は不要になる |
| `src/manifest/collectDeliveryManifest.ts` | `loadWorkbook`→`WorkbookData` | 新型へ。表示・カード判定と**同一の範囲解釈**を共有する |
| `src/plugin/markdownMatrixPlugin.ts` | `loadWorkbook`→`WorkbookData` | 新型へ |
| `src/extension.ts` | `WorkbookCache<WorkbookData>`を3か所で生成 | 型引数の差し替えのみ |
| `src/cache/workbookCache.ts` | 型引数で汎用化済み | 変更不要 |

`src/dx/autocompleteProvider.ts`と`src/dx/diagnostics.ts`は`loadWorkbook`を直接呼んでいない。

影響するテスト（全19ファイル中）

| テスト | 参照数 | 影響 |
| --- | --- | --- |
| `test/workbookCache.test.ts` | 18 | 型・シート形状を直接組み立てている。最も改修量が多い |
| `test/autocompleteProvider.test.ts` | 8 | シート形状の組み立て |
| `test/csvEncoding.test.ts` | 4 | CP932回帰。**壊さないこと**（コミット`0154944`） |
| `test/smartFallback.test.ts` | 3 | 寸法算出の経路が変わる |
| `test/markdownMatrixPlugin.test.ts` | 77（描画経由） | 型には触れないが出力で影響を受け得る |
| `test/conformance.test.ts` | 20ケース | 下記のとおり現状は影響なし |

### 変更の影響範囲（実測）

同梱のサンプルとフィクスチャ25件を走査し、現在の出力が変わるものは0件だった。`04_Documentation/samples/practical/data/design.xlsx`の3シートはいずれもA1起点・途中空行なし・エラーセルなし・結合なし。CSV/TSVにも先頭・途中の空行は無い。conformanceコーパス20ケースにも該当が無い。

したがって次の2点が導かれる。

- 回帰の危険は低い。 ただし「既存が壊れないこと」は正しさの証明にならない。
- 現在のコーパスは新しい挙動を1件も覆っていない。 非A1起点・途中空行・エラーセル・結合セルのケースをconformanceコーパスとユニットテストへ追加することが必須である。追加しなければ修正は未検証のまま残る。

### テスト用フィクスチャの作り方

Excelを必要としない。 SheetJSで`!ref`を`C5:F12`にし、9行目を空にしたブックを書き出せば、Excelが作ったブックと同じ結果になることを確認済み（両者とも現行実装で3行`[["取消済","合格"],["ST-002"],["完了","合格"]]`を返す）。既存の`test/workbookCache.test.ts`が一時ディレクトリへ`XLSX.write`する方式に合わせ、バイナリをリポジトリへ追加しない。

`03_Implement/scripts/clipboard-probe/`のスクリプトは製品関数を複製しているため、回帰試験としては使わない。製品コードを直接呼ぶテストへ置き換える（レビュー指摘）。ハーネスは観測とクリップボードの採取に限る。

### 記法仕様の空白（実装と同時に決める）

[記法仕様](../../04_Documentation/spec/mmi-notation-v1.md)§6の手順1は「`range` があればA1範囲で行列を切り出す（単一セル指定は1×1）」としか述べていない。作業Bで変える挙動のうち、次は仕様が定めていない。 実装の都合で黙って決めず、仕様側の判断を得る（[作業ルール](../../00_Prompt/system_prompt.md)「実装の都合で意味を変えない。不一致を見つけたら対象と影響を明示する」）。

| 未定義の点 | 現在の実装 | 設計案 |
| --- | --- | --- |
| 範囲内の空行を保持するか | 除去される | 保持する。原本の形状を正とする |
| 切り出しが矩形を保証するか | 保証しない（行長が不揃い） | 保証する。欠落セルは空文字。§6手順2の`columns`と同じ扱い |
| エラーセルの表示 | 空欄 | `#DIV/0!`等をそのまま表示。P2（見える失敗）に沿う |
| `sheet`指定・`range`省略の対象 | 読み込んだ行列全体 | 使用範囲（`!ref`） |
| 表示文字列の基準 | SheetJSの既定＋`dateNF` | 原本の表示値。日付の扱いは本Issueの必須条件にしない（R5） |

いずれもP3（決定論）とP8（機械可読な契約とconformanceコーパス）に関わる。仕様へ加筆するか、明示的に「参照実装の裁量」と位置付けるかを決めてから実装を確定する。conformanceコーパスへのケース追加は、この判断と対で行う。

### 前提環境の不足（着手前に解消する）

この調査環境にはNode.js・npm・実体のあるPython 3がいずれも導入されていない（`python`はMicrosoft Storeのスタブで0バイト）。計測はVS Code同梱のNode（`ELECTRON_RUN_AS_NODE`）で代用した。

そのため次が未実行である。実装着手前に[開発環境](../../04_Documentation/developer-setup.md)の前提を満たすこと。

- `npm ci` / `npm run build` / `npm test` / `npm run test:e2e`
- `python 01_Plans/tools/planning_queue.py`

### 観測済み: VS CodeのDataTransfer（作業C、2026-09-11完了）

実施済み。 結果は`text/plain`・`text/html`・`text/rtf`・`image/png`の4件のみで、出所形式は含まれない。詳細は「Cの完了内容」節、[クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)§2。[ADR-0017](../adr/ADR-0017-windows-clipboard-provenance-bridge.md)の選択肢1は却下確定、選択肢2（補助プロセス）の採否は未決定のまま作業Dへ進める。

再現手順（再実行する場合）は次のとおりです。

```powershell
powershell -ExecutionPolicy Bypass -File .\03_Implement\scripts\clipboard-probe\build-books.ps1
powershell -ExecutionPolicy Bypass -File .\03_Implement\scripts\clipboard-probe\probe-vscode.ps1
```

### Acceptance criteria

段1: 原本座標

- [x] `設計.xlsx#状態遷移|C5:F12`（使用範囲C5開始・9行目が空行）が、ヘッダ`ID/操作/遷移後状態/判定`から始まる8行×4列として表示される。実機（フルパイプライン経由のレンダリング）で確認済み。
- [x] 空行が`["","","",""]`として保持され、エラーセルが`#DIV/0!`として表示され、全行の列数がそろう。`sliceRegion`が矩形を保証するため構造的に成立し、テストで固定済み。
- [x] 原点が遠方の疎なシート（例`ZZ5000`開始）で、要求した矩形だけを実体化する。全体をA1から展開しない。`measureRegion`は寸法計算にセルへ一切触れないことをテストで保証（`cellAt`呼び出しで例外を投げる`SheetSource`を使用）。`sliceRegion`は要求範囲のみ走査する実装で、A1拡張は行わない。
- [x] **R3: 実体化の前に寸法を算術評価する。** `measureRegion`→カード判定→（table確定後のみ）`sliceRegion`の順序で実装済み。範囲省略・使用範囲外・0/逆順の住所はテストで確認。`mode=table`でのセル数上限は実装済み（2026-09-14、「`mode=table`強制時のサイズ上限」節）。**協調型budgetは実装済みだが、strict wall-clock timeoutは未実装のまま**（下記「未対応で残る点」）。
- [x] **R3: 表示・カード判定・納品マニフェストが同じ範囲解釈を使う。** `smartFallback`・`renderTable`は同じ`measureRegion`/`sliceRegion`を呼び、`collectDeliveryManifest`は`smartFallback`の関数を経由するため同一の範囲解釈を共有する。
- [ ] 読込みとモデル構築の費用を切り出し時間と別に計測する。切り出し時間を「照合が安価」の根拠に流用しない。**未実施**（性能計測は本セッションの範囲外）。
- [x] **新しい挙動を覆うケースを追加する。** `test/tableGeometry.test.ts`（新規19件）、`test/workbookCache.test.ts`（+7件: 非A1起点+空行、エラーセル、宣言済み結合の取得と非推定、range省略）、conformanceコーパス+1件（宣言範囲幅が実データ幅を上回る場合のカード化）。
- [x] 空行保持とエラーセル表示による行数・セル数の変化を、同梱サンプル・フィクスチャ25件・conformanceコーパス20件で前後比較（該当0件、実装後の実描画でも再確認）。**ユーザー確認は未取得**（走査結果の提示のみ）。
- [x] `test/csvEncoding.test.ts`のCP932回帰を維持する（コミット`0154944`）。全件成功を確認。UTF-8固定の処理へは戻していない。
- [x] `dateNF`の効果範囲を`workbookLoader`のコメントと一致させる（書式を持たない日付セルには効き、自身の書式を持つセルには効かない）。コード上のコメントを訂正済み。表示基準そのものの変更はしていない（R5、本Issueの必須条件にしない方針どおり）。`SourceCell{text,value,formula}`により表示用の値と型付き値を区別する形にした。
- [x] CSVの全体`trim()`による座標ずれの影響範囲を整理する（2026-09-15）。依存テストの洗い出し完了: 既存テストで先頭空行のtrim挙動に依存するものは0件（`test/csvEncoding.test.ts`・`test/workbookCache.test.ts`・`test/conformance/cases.json`・`test/markdownMatrixPlugin.test.ts`のCSVフィクスチャを全数確認、先頭が空行のものは無かった）。つまり修正しても既存テストは1件も壊れない——ただし修正するかどうか自体は別判断のまま（下記「CSVの座標ずれ（trim）の影響範囲調査」節）。現在の（意図的に修正していない）挙動を`test/workbookCache.test.ts`に1件のピン留めテストとして追加し、将来の変更が事故ではなく明示判断になるようにした。

段2: 貼り付け

- [x] `DataTransfer`のMIME一覧を観測し記録する。人工HTMLだけで完了にしない。完了（2026-09-11、「Cの完了内容」参照）。 `text/plain`・`text/html`・`text/rtf`・`image/png`のみ。出所形式なし。
- [x] 実Excelで`C5:F12`をコピーし、同じ開始位置と範囲の記法が挿入され、原本の対応値が表示されることを実機確認する。明示コマンド経路は実VS Code（1.138.0）上のe2eで確認済み（2026-09-17）——実Excelそのものではなく実ワークスペースの実CSVファイルに対してだが、クリップボード値→検索→候補提示→挿入という全パイプラインを実際のExtension Hostで実証した。`editor.action.pasteAs`経路のみ未確認（実クリップボードへの`text/html`設定手段が本環境に無いため）。詳細は「実VS Code GUI確認」節。
- [x] `extractSupportedFilepathFromHtml`が原本パスの代わりにExcelの一時ステージング参照（`msohtmlclip`配下の`clip_filelist.xml`）を誤って一致させ、壊れた提案を生成していた不具合を修正済み。 実キャプチャで再現・確認。詳細は「`pasteDrop.ts`の不具合修正」節。回帰テスト2件を`test/pasteDrop.test.ts`へ追加。
- [x] `inferRangeFromHtmlTable`がA1起点の範囲を返す処理を、形状のみを返す処理へ置き換える。完了（2026-09-14）。 `extractHtmlTableShape`へ置き換え、`suggestEmbedFromClipboardHtml`は`sheet`・`range`を一切返さなくなった。詳細は「`pasteDrop.ts`のシート名・範囲推測の撤去と占有グリッドの移植」節。
- [x] 単一セル・単一行・横結合・縦結合のコピーで、形状が正しく算出される（単一行では`<tr>`が断片外に出るため`<table>`全体から数える）。完了。 占有グリッド方式を`probe-lib.cjs::htmlShape`から製品コード（`extractHtmlTableShape`）へ移植し、rowspan反例・単一行フラグメント外`<tr>`・広い表のテストで固定。実キャプチャ（C5:F12、空行含む）でも`{rowCount: 8, columnCount: 4}`が正しく算出されることを確認。ただし「形状が住所と一致する」の検証（占有グリッドの結果を実際のExcel住所と突き合わせる）は行っていない——出所（住所）自体が取得できないため、この検証は内容照合（作業D本体）の実装後に行う。
- [ ] フィルターで可視行のみのコピー（住所3行・内容2行）と列全体のコピー（住所`C3:C4`）を自動確定せず理由を表示する。
- [x] 出所が確認できない経路では、内容照合または利用者指定に頼る。`SourceURL`は`DataTransfer`には現れない。2026-10-05、候補を選んだ後にも原本の同じ範囲を現在の保存内容から再読込し、クリップボード値と完全一致する場合だけ挿入するようにした。コピー後に原本が変更・保存され、選択範囲の値が変わった場合は挿入を中止する。
- [ ] 同一内容が複数箇所にある場合（`重複`シート）、唯一に見えても出所の証明とせず、「出所あり」と「推定」を画面上で区別する。内容照合の仕組み自体は実装済み（`findWorkbookContentMatches`は複数一致を全件返し、`showQuickPick`で必ず明示選択させる——唯一の一致でも自動確定しない）。ただし出所は常に取得不能なため「出所あり」区分は現状発生せず、「出所あり/推定」の画面上の区別自体は未実装（架空の`重複`シートを使った実データでの確認も未実施）。
- [ ] 非ANSI文字を含むパス（`設計_한글.xlsx`）で、`Link`が壊すファイル名を`SourceURL`から正しく復元する。橋渡し（作業E）を実装する場合のみ該当。 DataTransfer単独の経路では`Link`/`SourceURL`いずれも入手できないため無関係。
- [ ] 橋渡しを採る場合、`vscode.env.remoteName`がある環境では使用せず、`DataTransfer`との突き合わせに失敗したら出所を破棄し、`OpenClipboard`失敗時も貼り付け操作を止めない。
- [ ] 通常貼り付けを維持し、MMI貼り付けを選択できる。中止・Undo1回・読み込み失敗・未信頼workspace・境界外を検証する。通常のCtrl+V（`triggerKind: Automatic`）は内容照合の追加により一切変更していない（コードレベルでは`context.triggerKind === PasteAs`のガードで確認済み）が、実際にVS Code上で操作しての確認はまだ行っていない。
- [ ] 元データのハッシュ不変、クラウドAPI呼出しなし、実コピー30件以上の結果と画面を保存する。

### Validation plan

既存のbuild/unit/Extension Host回帰に加え、非GPUのWindows実機で操作・データ・誤確定・CPU時間を検証する。端末と試験データを固定し、機械検査と実機結果を分けて保存する。

観測の再現手順は[clipboard-probe](../../03_Implement/scripts/clipboard-probe/README.md)。宣言している最低VS Codeは`^1.96.0`だが調査環境の型定義は`1.110.0`のため、最低版と現在版の両方で宿主テストを行う。外部送信や新たなネイティブ連携が必要になれば[ADR-0017](../adr/ADR-0017-windows-clipboard-provenance-bridge.md)を更新して判断する。

## Remaining work

段1（作業B）は実装・テスト完了。作業C（DataTransfer観測）も完了し、出所はDataTransfer単独では取得できないと確定した。作業Cで採取した実データにより、`pasteDrop.ts`の壊れたファイルパス誤認識（Excelの一時ステージング参照を原本と誤認）を発見・修正し、続けてシート名・範囲の誤った推測も撤去して占有グリッド方式の形状抽出（`extractHtmlTableShape`）へ置き換え、TSVの値行列抽出（`parseTsv`）、単一の原本`SheetSource`内を検索する内容照合アルゴリズム本体（`findContentMatches`）、複数ワークブック横断の集約（`findWorkbookContentMatches`）、そして新規コマンド`markdownMatrixInjector.insertEmbedByContentMatch`としての`extension.ts`配線までを実装した（2026-09-14〜15、「作業D: 内容照合コマンドの実装」節）。段2（作業D）はこれで実装完了。 残るのは次の点。

- **作業Dは実装完了（2026-09-16）。自動貼り付け統合も完了した。** `editor.action.pasteAs`（既定Ctrl+.）経由で、内容照合の候補がVS Code標準の「貼り付け方法を選ぶ」ドロップダウンに並ぶ。通常のCtrl+V（`triggerKind: Automatic`）の挙動は変更していない——VS Codeの複数`DocumentPasteEdit`は`Automatic`だと最初の1件を即座に自動適用してしまうため、そこに含めるとR1（自動確定しない）に反するリスクがあった。`PasteAs`は挿入前に選ばせる契機のため、ここへ限定して組み込んだ。ワークスペース全体検索の性能懸念は実測（ネイティブファイルシステムで30ファイル約20ms、300ファイル約65〜140ms）により大幅に緩和されたことを確認済み。**2026-09-17、実VS Code（1.138.0）でのe2e確認をWSLg（xvfb不要）経由で実施し、明示コマンド経路（`insertEmbedByContentMatch`）の全パイプラインを実証した。** この過程で本物のバグを2件発見・修正した：(1) e2eテスト自体の期待値が2026-09-14の変更（シート名・範囲推測の撤去）に追従しておらず旧`#Sheet|Range`形式のままだった、(2) `insertEmbedByContentMatch`が`registerTextEditorCommand`で登録されていたが、これは非同期コールバックを一切サポートしないVS Codeの既知の制約（microsoft/vscode#178931等）に該当し、**実運用でも常にコマンドが何も挿入できていなかった可能性が高い**（`registerCommand`＋`vscode.window.activeTextEditor`の自前解決へ修正）。**2026-10-01、OSクリップボードへHTMLを注入できない環境でも宿主dispatchを自動検証できるよう、paste providerの対象へ`text/plain`を追加し、`vscode.env.clipboard.writeText`でExcel互換TSVを置いたうえでVS Code組み込み`editor.action.pasteAs`をcontent-match edit kind指定で実行するExtension Host E2Eを追加した。** pure `text/plain` の通常Pasteでは直接MMI editを返さないガードを併設し、同じTSVを`editor.action.clipboardPasteAction`で貼った場合は生テキストのままであることもE2Eで対にしている。**このWeb作業環境ではE2E自体は未実行**のため通過済みとは数えない。また、この自動化が証明するのはVS CodeのPaste As宿主dispatch＋plain TSV内容照合までであり、実Excelが供給する`text/html`、Windows clipboard helper由来のconfirmed provenance、視覚pickerを人が選ぶ操作は引き続きWindows実機証拠が必要。候補一覧は2026-10-02に、表題・見出し・直前/直後の行を1行へ圧縮して識別できるよう改善した。**同日、候補範囲そのものの先頭2行もsource由来の実値としてcontextへ保持し、QuickPick詳細とPaste Asの圧縮表示へ追加した。** 候補を開かずに「どの表のどの実データか」を判断しやすくしつつ、巨大セル・巨大範囲がpickerを占有しないよう、Paste As側は既存の文字数上限、QuickPick側は2行上限を維持する。
- **2026-10-05、挿入直前の鮮度検証を追加した。** 明示コマンドは検索開始時の文書versionと選択範囲を保持し、QuickPickで候補を選んだ後に、選択した原本範囲を現在の保存内容から再読込して再照合する。原本範囲、編集中のMarkdown、または選択範囲が変わっていれば挿入しない。Paste AsはVS Codeの`resolveDocumentPasteEdit`を使い、利用者が候補を選んだ後、適用直前に同じ文書versionと原本範囲を再検証する。原本のmtimeだけを見る方式は採らず、実際の表示値が同じかを確認する。これにより、原本の別領域だけが変わった場合は不要に拒否せず、参照対象そのものが変わった場合だけ中止できる。
- `mode=table`強制時のサイズ上限は実装済み（2026-09-14）。構造化診断 `MMI_TABLE_TOO_LARGE` も2026-10-02に実装済み。時間制御は協調型budget基盤まで実装済み。残るのは、計測に基づく本番既定値の決定と、SheetJS同期parse等の非協調処理をpreemptできるworker/process境界によるstrict wall-clock timeout。
- 読込み・モデル構築の分離計測ハーネスは実装済み。残: Windows実機での数値取得、とくにOSページキャッシュを制御したcold-read証拠。
- CSVの`trim()`起因の座標ずれの依存テスト洗い出しは完了（2026-09-15、下記節）。**修正するかどうかの判断自体は未着手のまま**（既存テストへの影響は無いことが分かっただけで、CSVにXLSXと同じ原点保持契約を広げるべきかは別途の製品判断）。
- 空行保持・エラーセル表示の既存文書への影響（走査では該当0件）について、ユーザーへの確認取得。
- 最低対応版でのDataTransfer観測の再現（今回は現行版1.137.0のみ）。2026-09-24、宣言していた`^1.96.0`では拡張機能自体が起動しない（ESM配布のためVS Code 1.99以前は`ERR_REQUIRE_ESM`）ことを実測し、`engines.vscode`を`^1.100.0`へ改めた。 1.100.0では実サンプルの全参照・補完・複数ルートの確認がすべて通る（`npm run test:e2e:practical`、`VSCODE_VERSION=1.100.0`）。
- 実キー入力（Ctrl+V）とコマンド経由貼り付けの経路一致の実測（意図的に未検証。理由は「Cの完了内容」参照）。
- UI操作でのCtrl+ドラッグ非連続選択の挙動（COM経由では外接矩形が出力された）。
- 巨大な選択でのクリップボード生成時間とHTMLの大きさ。上限とキャンセルの設計に必要。
- ~~ADR-0017選択肢2を実装するかの判断~~ → 2026-09-25に採用・実装・実Excelで検証済み（[ADR-0017](../adr/ADR-0017-windows-clipboard-provenance-bridge.md)「採用と実装」）。`Paste As`と明示コマンドで、照合済みのコピー元が「コピー元を確認済み」として先頭に出る。残り: 実VS Code（Windows）上でのCtrl+./Paste Asからの実操作確認。

## 実装開始前のレビュー受入条件

- [x] R1: 同一内容の別コピーを自動確定しない。初期提供では出所情報も候補として明示選択する。**明示コマンド（2026-09-15）・自動貼り付け統合（2026-09-16）の両方で実装済み**——明示コマンドは`showQuickPick`、`editor.action.pasteAs`（Ctrl+.）はVS Code標準のドロップダウンで、結果が1件でも複数件でも必ず明示選択を経る。通常のCtrl+V（`triggerKind: Automatic`）には一切組み込んでいない——VS Codeの複数`DocumentPasteEdit`は`Automatic`だと最初の1件を自動適用してしまうため（実測・公式ドキュメントで確認済み）。**明示コマンド経路は実VS Code上のe2eで実証済み**（2026-09-17、「実VS Code GUI確認」節）。**ただし出所（provenance）自体は依然として取得不能**（作業C確定、DataTransferは出所形式を運ばない）ため、常に「推定」区分としての明示選択になる。
- [x] R2: 結合セルを占有位置付きで復元し、断片外の行・複数表を誤って採用しない。**`extractHtmlTableShape`（作業C後）とソースモデル側の宣言済みmerges取得（作業B）で実装・テスト済み**。
- [x] R3: 巨大範囲を実体化する前に寸法と資源上限を評価する。表示・カード・マニフェストで範囲契約を共有する。**作業Bで実装しテストで保証**（`measureRegion`はセル無接触、3経路が同一関数を共有）。`mode=table`強制時のセル数上限も実装済み（2026-09-14）。協調型budget基盤は実装済み。本番既定値と、非協調処理まで強制中断するstrict wall-clock timeoutは未実装で残る。
- [x] R4: Object Descriptorのサイズ・オフセット・終端を検証し、URIを一度だけ復号して実パス境界を確認する。（観測ハーネス側、作業Aで完了）
- [x] R5: 日付比較を独立したセルで再現し、providerが呼ばれない観測を不成功として扱う。（観測ハーネス側、作業Aで完了。日付の実効範囲に関する誤った説明はワークブックローダーのコード上のコメントでも作業Bで訂正済み。この設計は2026-09-11の作業Cで実際に機能した——`pasteMimeTypes: ['*']`の不具合でproviderが呼ばれなかった際、ハーネスは終了コード2で失敗し「出所形式なし」という誤った結論を防いだ）
- [x] 現行CP932の読込みと既存UTF-8の回帰を維持する。作業B実装後も`test/csvEncoding.test.ts`全件成功を確認。
