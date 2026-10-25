> 実装条件と測定値の解釈は[設計レビューと作業指示](input-assistance-design-review.md)を参照。切出し単体の測定を厳密照合や検索全体の性能と扱わない。

# MMI入力支援 技術調査

- 調査日: 2026-09-10。状態: **設計確定。原本座標を保持する読込み・切り出し（issue-0114段1）は2026-09-11に実装・自動テスト済み。貼り付け・CPU探索は未着手。**
- 対象コードの基準コミット: `0fedd60`は次のとおりです。
- 企画の正本は[改訂企画書](input-assistance-proposal.md)、判断は[ADR-0016](../../../01_Plans/adr/ADR-0016-notation-first-input-assistance.md)と[ADR-0017](../../../01_Plans/adr/ADR-0017-windows-clipboard-provenance-bridge.md)。

本書は確認済みの事実と未確認事項の区分を保つ台帳である。契約と構造は[02_Architecture](../../../02_Architecture/README.md)の3つの設計文書に置き、ここへ重複させない。製品仕様の追加や性能保証は行わない。

## 1. 何を確認し、何を確認していないか

| 論点 | 状態 | 根拠 |
| --- | --- | --- |
| Excelコピーに原本の出所と住所が含まれるか | **確認済み。含まれる** | 実Excelから13ケースの生バイトを採取 |
| HTMLだけで開始セルを決められるか | **確認済み。決められない** | `HTML Format`本文にセル住所が無い |
| VS CodeがそれらのMIMEを公開するか | **未確認。最大の未解決事項** | 宿主の更新保留で観測を実行できず |
| 現行の読込みが原本座標を失うか | **確認済み。失う** | 実ブックで誤った矩形を再現・計測 |
| 座標保持の実現方法 | **実装済み** | 4案を比較・採用案を実装。`SourceCell.text`が旧`sheet_to_json`出力と一致することを全ケースで確認 |
| 座標保持の費用 | **一部のみ計測** | 切出し単体の時間のみ。読込み・モデル構築・値照合は未計測 |
| CPUでの自然言語探索の性能・精度 | **未測定** | 実装・評価データとも未着手 |
| FlyHashの有効性 | **未確認** | 原論文を確認。MMIでの比較は未実施 |
| 費用 | 推奨経路は外部推論APIを呼ばない設計 | ローカル計算・索引保存の資源は必要。速度・容量は未測定 |

非GPUのローカルLLMが本用途で必ず遅いと実証したわけではない。利用者の想定と優先順位に従い、必須構成から外す。

## 2. 観測環境

| 項目 | 値 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26200 |
| Excel | Microsoft Excel 16.0（Office ClickToRun 16.0.20326.20132、ja-jp） |
| VS Code | 1.136.1 |
| Node | v24.18.1（VS Code同梱の実行環境を`ELECTRON_RUN_AS_NODE`で使用） |
| SheetJS | 0.20.3（リポジトリ導入済み） |

架空ブックのみを使用した。実業務のブックとクリップボードは採取に使っていない。再現手順は[clipboard-probe](../../../03_Implement/scripts/clipboard-probe/README.md)。

**この環境ではnpm/nodeが導入されておらず、`npm ci` / `npm run build` / `npm test`を実行していない。** 計測はSheetJSを直接読み込むスクリプトで行った。実装時は[開発環境](../../developer-setup.md)の手順で回帰検査を行う。

## 3. 一次資料

- [Microsoft CF_HTML仕様](https://learn.microsoft.com/en-us/windows/win32/dataxchg/html-clipboard-format): `StartFragment`等はバイト位置であり、Excelの行列番号ではない。日本語を含む場合、JavaScript文字列の位置と同一視できない。
- [Excel XlClipboardFormat](https://learn.microsoft.com/en-us/office/vba/api/excel.xlclipboardformat): 形式の列挙。形式が存在することと、VS Codeへ渡ることは別である。
- [VS Code API: DocumentPasteEditProvider](https://code.visualstudio.com/api/references/vscode-api#DocumentPasteEditProvider): `prepareDocumentPaste`はVS Codeのエディタからのコピーを扱うため、ExcelでのCtrl+CにMMI固有メタデータを付ける入口にはならない。
- [Dasgupta, Stevens, Navlakha, Science 2017](https://cseweb.ucsd.edu/~dasgupta/papers/fly-lsh.pdf): FlyHashの原論文。日本語からの特徴生成やExcel座標の解析は含まない。論文の評価からMMIの精度・待ち時間を推定できない。
- [Stanford IR textbook: BM25](https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html): 語彙検索の比較基準。
- [SheetJS 配列変換](https://docs.sheetjs.com/docs/api/utilities/array/) / [セルモデル](https://docs.sheetjs.com/docs/csf/cell/) / [結合セル](https://docs.sheetjs.com/docs/csf/features/merges/)
- [Chevrotain lexer tutorial](https://chevrotain.io/docs/tutorial/step1_lexing.html): 限定文法の解析器を外部依存にする場合の比較対象。依存追加は未決定。

オンライン資料の確認日は2026-09-10。実装時は最低対応版と依存版で再確認する。

## 4. 現行コードとの差分

| 箇所 | 確認した事実 |
| --- | --- |
| [pasteDrop.ts](../../../03_Implement/src/dx/pasteDrop.ts) | `inferRangeFromHtmlTable`はHTMLの表の大きさから常にA1起点の範囲を返す。コピー断片内の座標であり原本のセル座標ではない |
| 同上 | 転送値の取得に`trim()`を使う。TSVの端のタブ・空セル・引用内改行・末尾行区切りを失う |
| 同上 | シート名をHTMLの`title`や`data-sheet`から取る。原本シートの確証にならない |
| [workbookLoader.ts](../../../03_Implement/src/core/workbookLoader.ts) | `blankrows: false`と`sheet_to_json`のA1起点前提により、非A1の使用範囲と途中の空行で座標がずれる |
| 同上 | `cellDates`+`dateNF`は**書式を持たない日付セルには効く**（`4/3/26`→`2026-04-03`）が、自身の書式を持つセルには効かない。コメントが述べる「日付型セル全般のISO化」は成り立たない |
| 同上 | `parseCsv`のファイル全体`trim()`が、先頭の空行数だけA1原点をずらす |
| [tableGeometry.ts](../../../03_Implement/src/core/tableGeometry.ts) | `sliceRange`は配列がA1起点の物理行列であることを前提にする |
| [smartFallback.ts](../../../03_Implement/src/core/smartFallback.ts) | `cellCount`が行長の合計のため、長さの違う行でセル数を過少に数える |
| [renderTable.ts](../../../03_Implement/src/core/renderTable.ts) | 行配列をそのまま`<td>`へ写すため、長さの違う行が列崩れの表になる |
| [extension.ts](../../../03_Implement/src/extension.ts) | 貼り付け処理が文書・キャンセル等の引数を利用していない |
| [pasteDrop.test.ts](../../../03_Implement/test/pasteDrop.test.ts) | 人工的な`data-sheet`とファイルパスを付けたHTMLで成功を確認している。実Excelの出所・住所取得の証拠ではない |
| package.json | 宣言上の最低VS Codeは`^1.96.0`だが、調査環境の`@types/vscode`は`1.110.0`。最低版と現在版で宿主テストを行う |

計測値と設計の結論は[ソースモデル](../../../02_Architecture/input-assistance-source-model.md)と[クリップボード出所と照合](../../../02_Architecture/input-assistance-paste-provenance.md)にある。

## 5. 次の担当が実施する検証

### A. VS CodeのDataTransfer観測（最初の作業）

```powershell
powershell -ExecutionPolicy Bypass -File .\03_Implement\scripts\clipboard-probe\build-books.ps1
powershell -ExecutionPolicy Bypass -File .\03_Implement\scripts\clipboard-probe\probe-vscode.ps1
```

VS Codeに保留中の更新があると2つ目のインスタンスが起動しない。VS Codeを再起動して更新を完了させてから実行する。結果で[ADR-0017](../../../01_Plans/adr/ADR-0017-windows-clipboard-provenance-bridge.md)の採否が決まる。

OS形式の観測と拡張機能での利用を分けて記録する。情報を取得できない場合は、対象ブック選択＋矩形内容照合＋候補選択で基本機能が成立するか判定する。Windows専用連携を採るなら保守・配布・Remote環境の実行場所をADR-0017へ追記する。

### B. 貼り付けの実機検証

架空ブックで30ケース以上を用意し、Excel/Windows/VS Codeの版、DataTransfer MIME、出所・住所の有無、実際の挿入結果と表示値を一行ずつ記録する。[issue-0114](https://github.com/hat47x/markdown-matrix-injector/issues/495)の受入条件を判定単位とする。

### C. CPU探索（基本貼り付けと補完の後）

日本語依頼60件以上を、完全名・略称・言い換え・誤字・同名・未対応条件・該当なしに分ける。正解のブック・シート・範囲と許容する候補を人手で固定し、調整用と評価用を分離する。10/100/1000ブック、1千/1万/10万領域の段階を用意し、合成データと業務を模した架空データを区別する。測定項目と目標は[CPUでの範囲探索](../../../02_Architecture/input-assistance-cpu-search.md)§5。

## 6. 引継ぎ境界

次の担当は、[AGENTS.md](../../../AGENTS.md)、[要求仕様](../../../00_Prompt/requirements.md)、[記法仕様](../../spec/mmi-notation-v1.md)、本書、[企画](input-assistance-proposal.md)、設計文書3件、[issue-0114](https://github.com/hat47x/markdown-matrix-injector/issues/495)の「Bの完了内容」を読み、issue-0114の作業C（VS CodeのDataTransfer観測）から着手する。並行して0110（補完）に着手できる。0111の順に進み、0112は任意、0113のローカルLLMは保留する。Draft/Proposedを実装済みと読み替えない。

**2026-09-11に実施した事項（WSL2 Ubuntu、Node v20.20.2）:** issue-0114段1（原本座標を保持する読込み・切り出し）の実装。`npm ci`／`npm run build`／`npm test`（258件成功）／conformanceコーパスへのケース追加／実サンプルでの回帰確認／旗艦の再現ケースの実描画確認。

**今回も実施していない事項:** VS CodeのDataTransfer観測（宿主のVS Code更新保留により本セッションでも再試行不能）、貼り付け機能そのものの実装、検索索引の実装、FlyHashの実装、日本語精度・CPUベンチマーク、`mode=table`強制時の資源上限、読込み自体の性能計測、新VSIXの作成。
