# 原本座標を保持するソースモデル

- 状態: 実装・自動テスト完了（2026-09-11）。 計測日2026-09-10。実装はWSL2 Ubuntu（Node v20.20.2）で行い、`npm run build`・`npm test`（258件）が成功する。VS Code実機での確認と性能計測は未実施。
- 対象: [sheetSource.ts](../03_Implement/src/core/sheetSource.ts)（新規）、[workbookLoader.ts](../03_Implement/src/core/workbookLoader.ts)、[tableGeometry.ts](../03_Implement/src/core/tableGeometry.ts)、[smartFallback.ts](../03_Implement/src/core/smartFallback.ts)、[renderTable.ts](../03_Implement/src/core/renderTable.ts)
- 関連: [ADR-0016](../01_Plans/adr/ADR-0016-notation-first-input-assistance.md)、[issue-0114](https://github.com/hat47x/markdown-matrix-injector/issues/495)（実装内容は「Bの完了内容」節）、[記法仕様](../04_Documentation/spec/mmi-notation-v1.md)

貼り付け・補完・範囲探索はいずれも「原本のA1座標」（Excel上のセル位置）を共通の基準にする。2026-09-10の調査では、当時の読み込み処理がその基準を失う問題を確認した。本書は、その実測結果と修正に用いるソースモデルを記録する。

## 1. 実測した不具合

架空ブック（使用範囲`C5:F12`、9行目が完全な空行、`Excel 16.0`で作成・保存）を、リポジトリ導入済みのSheetJS 0.20.3と現行の読込オプションで変換した。実行環境はVS Code 1.136.1同梱のNode v24.18.1。

`![[設計.xlsx#状態遷移|C5:F12]]` は、正しくは次の8行×4列になる。

```
ID      操作  遷移後状態  判定
ST-001  申請  審査中     要確認
ST-002  承認  承認済     合格
ST-003  差戻  記入中     要確認
(空行)
ST-004  取消  取消済     合格
007     2026/04/03  ST-002  #DIV/0!
ST-006        完了      合格
```

調査当時の`sheet_to_json({ header: 1, raw: false, blankrows: false })`と`sliceRange`の組合せは、次を返した。

```
取消済  合格
ST-002
完了    合格
```

これは別位置から切り出された、行数が3行で列数もそろわない結果である。調査では、次の2つを原因とした。

| 原因 | 内容 |
| --- | --- |
| 列原点の喪失 | 使用範囲がC列開始でも配列はA列開始で返るため、`slice(2,6)`が2列ずれた位置を切る |
| 空行の欠落 | `blankrows: false`が9行目を落とし、以降の行番号がずれる |

調査時点では、正しい参照文字列を挿入しても原本と表示が一致しなかった。そのため、Excelの範囲貼り付けに先立ってこの契約を修正する必要があった。

副作用として、[renderTable.ts](../03_Implement/src/core/renderTable.ts)は行配列をそのまま`<td>`へ写すため、長さの違う行が列崩れの表を生む。[smartFallback.ts](../03_Implement/src/core/smartFallback.ts)の`cellCount`は行長の合計なので、同じ理由でセル数を過少に数え、§7.4のカード判定を誤らせる。

## 2. 検討した解決方法と計測値

| 案 | 結果 | 判定 |
| --- | --- | --- |
| A. 現行 | 上記のとおり誤った矩形 | 不可 |
| B. `blankrows: true`のみ | 空行は戻るが列原点は戻らず、依然誤った矩形 | 不可 |
| C. `range`を`A1:<使用範囲の終端>`へ拡張 | 正しい矩形を得るが下記の3つの問題 | 不可 |
| D. 疎なセルモデルから住所で切り出す | 正しい矩形。空行は`["","","",""]`、`#DIV/0!`も保持 | **採用** |

案Cを採用しなかった理由は、以下の実測結果にある。

- 使用範囲`ZZ5000:AAB5010`（実セル1個）のシートで、A1への拡張は 3,527,040セルを実体化し2.1〜2.7秒 を要した。原点が原本の遠方にあるシートで破綻する。
- エラーセル`#DIV/0!`が`""`に落ちる。表示としても照合の基準としても失われる。
- 完全な空行は`defval`を与えても`[]`のまま返り、行長がそろわない。

案Dは、200,000行×40列・実セル1,142,880個の疎シートに対して次を計測した。

| 切り出し | 結果 | 時間（3回の実行の幅） |
| --- | --- | --- |
| `C5:F12` | 8行×4列 | 0.05〜0.20ms |
| `B100000:K100200` | 201行×10列 | 0.19〜0.48ms |

要求した矩形だけを実体化するため、走査量はその矩形のセル数に依存する。計測には読み込みとモデル構築を含まない。また単発の測定であり、統計的な保証ではない。比較対象と入力・処理量が異なるため、4桁の速度改善を実証したものでもない。要求範囲だけを展開する方針の参考値として扱う。

## 3. モデル

`string[][]`（行と列に並べた文字列の二次元配列）は表示に必要な切り出しの段階まで作らない。読み込み処理は物理座標付きの疎なセル集合（全域を二次元配列へ展開せず、位置を指定してセルを参照する構造）を返し、切り出し時に初めて矩形の表示行列を作る。

```
WorkbookSource
  sheets: Map<sheetName, SheetSource>

SheetSource
  usedRange?: { start: {row, col}, end: {row, col} }   // !ref。0基点。空シートはundefined
  merges: Array<{ start, end }>                        // 宣言された結合範囲のみ
  cellAt(row, col): SourceCell | undefined             // 疎参照

SourceCell
  text: string        // Excelの表示文字列。表示とクリップボード照合の基準
  type: 's'|'n'|'d'|'b'|'e'
  value: string|number|boolean|Date|null   // 先頭ゼロ・日付シリアルの区別に使う
  formula?: string    // 存在の記録のみ。評価しない
```

SheetJS（Excelファイルの読み込みライブラリ）から、この4項目を数式の再計算なしに取得した。以下は当時の実測例。

| セル | 取得値 |
| --- | --- |
| C11（文字列書式の`007`） | `t:'s' v:'007' w:'007'` |
| D11（日付） | `t:'d' v:2026-04-03T00:00:00Z w:'2026/04/03'` |
| E11（`=C7`） | `t:'s' v:'ST-002' w:'ST-002' f:'C7'` |
| F11（`=1/0`） | `t:'e' v:7 w:'#DIV/0!' f:'1/0'` |

`f`があっても`v`/`w`は保存済みの値である。数式を評価せず、外部リンクを更新しないという読み取り専用境界（要求「読み取り専用」、記法仕様P1）を保ったまま、型と表示値の両方を索引に使える。

結合範囲は`!merges`から取得できる（架空ブックの`A1開始`シートで`A4:B4`を取得、他シートは空）。空白セルから推定する必要はない。

### 切り出し

実体化の前に必ず寸法を算術で評価する（[レビューR3](../04_Documentation/history/input-assistance/input-assistance-design-review.md)）。案Dでも、範囲省略時に`usedRange`全体を、あるいは全シート相当の明示範囲をそのまま矩形化すれば、巨大な疎シートで停止する。順序を契約として固定する。

```
1. 住所を検証する            範囲外・0・逆順・桁あふれを棄却
2. 行数×列数を計算する        セルには触れない
3. カード判定と資源上限        記法仕様§7.4の閾値、メモリ・時間の上限
4. 許容された場合だけ実体化    sliceRegion(sheet, range) -> string[][]
```

- `range`があれば、その住所の矩形を`cellAt`で走査し、欠落セルは`''`で埋めて必ず矩形を返す。
- `range`省略時は`usedRange`を範囲とみなし、同じ順序で評価する。
- `mode=table`で強制された場合も上限を外さない。超過は記法仕様P2に沿う可視エラーとする。
- 10万セルのhard limit超過は `MMI_TABLE_TOO_LARGE` という安定した構造化コードを持つ。明示rangeならProblemsで算術的に事前検出し、previewの可視エラーにも同じcodeを`data-code`として残す。範囲省略時はused range確定後のレンダリング経路で同じcodeを返す。
- 時間制御は協調型とstrict timeoutを分ける。`CooperativeTimeBudget` は実体化・columns/transpose/grep・HTML化のbounded loopへ同一budgetを渡し、期限超過を `MMI_TABLE_TIME_BUDGET_EXCEEDED` として可視化する。これは同期ループ間で実際に中断できるが、SheetJSの同期parseや単一の遅い`cellAt`呼び出しを途中でpreemptする保証ではない。strict wall-clock上限にはworker/process境界が必要で、本番既定時間値は性能計測後に決める。
- 返す文字列は`SourceCell.text`。既存の変換パイプライン（記法仕様§6のcolumns→transpose→header→grep）は現在と同じ順序でこの矩形に適用する。転置は行列数を入れ替えるだけなので、判定は実体化前に済ませる。

表示・カード判定・納品マニフェストは同じ範囲解釈を共有する。 現行の[smartFallback.ts](../03_Implement/src/core/smartFallback.ts)は寸法を得るために`sliceRange`を先に呼ぶため、`sliceRegion`へ差し替えるだけでは巨大範囲の実体化を防げない。寸法算出を切り出しから分離することが前提になる。

矩形を保証することで、列崩れとセル数の過少計上が同時に解決する。

## 4. 既存の観測される挙動が変わる点

いずれも回帰試験の対象として先に固定する。conformanceコーパス（`03_Implement/test/conformance/`）と実務サンプルで前後を比較する。

走査結果（2026-09-10）: 同梱のサンプル・フィクスチャ25件のうち、出力が変わるものは0件。 `04_Documentation/samples/practical/data/design.xlsx`の3シート（状態遷移・権限・API）はいずれも`A1`起点で、途中空行・エラーセル・結合セルを持たない。CSV/TSVにも先頭・途中の空行が無い。conformanceコーパス20ケースにも該当が無い。

この25件の調査では既存サンプルの出力差分は見つからなかったが、非A1起点・途中空行・エラーセル・結合セルによる変化を1件も検証できなかった。当時のコーパスだけでは、修正対象となる挙動を確認できないという限界があった。

| 変わる点 | 影響 | 扱い |
| --- | --- | --- |
| 途中の空行が表に現れる | 行数・セル数が増え、記法仕様§7.4のカード閾値（列>10・セル>500）判定が変わる文書がある | 原本の形状を正とする。閾値超過は別紙化として正しい結果 |
| 使用範囲が非A1のシートで、範囲省略時の内容が変わる | 空行を含む形になる | 同上 |
| エラーセルが`#DIV/0!`として表示される | 現在は空欄 | 記法仕様P2（見える失敗）に沿う。原本の表示と一致させる |
| 行長がそろう | 列崩れが解消する | 修正 |

## 5. 未解決の判断: 日付の表示文字列

[workbookLoader.ts](../03_Implement/src/core/workbookLoader.ts)のコメントは、`cellDates` + `dateNF: 'yyyy-mm-dd'`が日付型セルをISO-8601へ強制し、`4/3/26`のような曖昧な表示を防ぐと説明している。この効果は書式を持たない日付セルに限られ、「日付型セル全般」には及ばない。 実測結果（条件ごとに独立したセルオブジェクトで測定。同じオブジェクトを使い回すと`w`キャッシュが後続の結果を汚染する）。

| セルの書式 | `raw:false` + `dateNF` | `raw:false`のみ |
| --- | --- | --- |
| 書式なし（独立オブジェクトで再確認） | `2026-04-03` | `4/3/26` |
| `m/d/yy` | `4/3/26` | `4/3/26` |
| `yyyy/mm/dd` | `2026/04/03` | `2026/04/03` |
| `yyyy"年"m"月"d"日"` | `2026年4月3日` | `2026年4月3日` |

1行目はコメントどおりに機能している。`dateNF`が無ければ`4/3/26`になる日付セルが`2026-04-03`になる。一方、自身の書式を持つセルには`dateNF`が届かない。Excelで作った日付列は通常なんらかの書式を持つため（実ブックのD11は`yyyy/mm/dd`書式で`2026/04/03`を返した）、実務上の多くの日付は正規化されていない。 コメントが目的とした「曖昧な短縮表記の回避」は、書式が`m/d/yy`のブックでは達成できない。

当時、判断事項として整理したのは次の点である。

- 表示の基準を`SourceCell.text`（Excelの表示文字列）に寄せる案。 クリップボードのHTMLも同じ表示文字列を含むため、照合の基準が一致する（§6参照）。ただし書式なし日付の現在の出力（ISO）が`4/3/26`へ変わるため、既存文書の表示が変わる。
- ISO表記を求めるなら、記法のパラメータとして明示的に足す。読込み時に全体を書き換えない。
- どちらにしても、効果の範囲を正しく述べるようコメントを修正する。

この選択は既存文書の表示を変えるため、[レビューR5](../04_Documentation/history/input-assistance/input-assistance-design-review.md)に従いissue-0114の必須条件にしない。 既存表示との差分を整理し、実装時にユーザー確認を得る。

## 6. クリップボード照合との接点

案Dの切り出しが返す文字列は、Excelがクリップボードへ書くHTMLのセル文字列と同じ表示値である。実測で一致を確認した項目。

| 項目 | 原本の`text` | クリップボードHTML |
| --- | --- | --- |
| 文字列書式の先頭ゼロ | `007` | `<td class=xl65>007</td>` |
| 日付 | `2026/04/03` | `<td class=xl66 align=right>2026/04/03</td>` |
| 数式の結果 | `ST-002` | `<td>ST-002</td>` |
| エラー値 | `#DIV/0!` | `<td align=center>#DIV/0!</td>` |
| 途中の空行 | `["","","",""]` | 空の`<td>`4個を持つ`<tr>` |

案Cではエラー値が`""`になり照合が外れる。案Dは外れない。貼り付けの照合が成立するかどうかは、このソースモデルの選択に直接依存する。 詳細は[クリップボード出所と照合](input-assistance-paste-provenance.md)。

## 7. CSVの原点保持

CSVもA1座標で参照する以上、ファイルに存在するレコード位置を保持する。先頭空行だけを除去すると、その後ろにあるセルの行番号が原本と一致しない。2026-09-15の調査では、この旧挙動に依存する既存テストがないことを確認した。2026-10-05に原点保持をCSVへ適用する方針を確定した。

[workbookLoader.ts](../03_Implement/src/core/workbookLoader.ts)の`parseCsv`はファイル全体の`trim()`を行わない。先頭と途中の空レコードは物理行として保持する。通常の末尾改行は直前レコードの終端として扱い、それだけで空行を追加しない。末尾に改行が連続する場合は、その間の空レコードを保持する。

この契約はTypeScript本体とportable Go最小実装で共通とする。内容照合では、先頭2行が空のCSVにある`Name,Role`をA3として検出する。conformance corpusでも`A3:B4`の参照を固定し、レンダリングと内容照合が同じ物理行を使うことを検証対象にした。

## 8. 再現手順

`03_Implement/scripts/clipboard-probe/`の`build-books.ps1`で架空ブックを作り、`repro-coords.cjs`を実行する。Node未導入の環境では、VS Code同梱のNodeを使える。

```sh
ELECTRON_RUN_AS_NODE=1 "<VS Codeのインストール先>/Code.exe" 03_Implement/scripts/clipboard-probe/repro-coords.cjs
```

回帰試験にはExcelを必要としない。 SheetJSで`!ref`を`C5:F12`にし9行目を空にしたブックを書き出すと、Excelが作ったブックと同一の結果（現行実装で3行`[["取消済","合格"],["ST-002"],["完了","合格"]]`）になることを確認済み。既存の`test/workbookCache.test.ts`と同じく一時ディレクトリへ`XLSX.write`する方式を使い、バイナリをリポジトリへ追加しない。

ハーネスのスクリプトは製品関数を複製しているため、回帰試験として使わない（[レビュー](../04_Documentation/history/input-assistance/input-assistance-design-review.md)）。製品コードを直接呼ぶテストへ置き換える。

## 実装結果（2026-09-11）

[設計レビュー](../04_Documentation/history/input-assistance/input-assistance-design-review.md)のR3/R5に従い実装した。日付比較ハーネスの`w`キャッシュ再利用は修正済み（§5の表は独立オブジェクトでの再測定値）。`SourceCell.text`は`XLSX.read()`が計算する`.w`をそのまま用いており、旧`sheet_to_json({raw:false})`の出力と1件ずつ突き合わせて一致を確認した（相違点はエラーセルの表示のみで、これは意図した修正）。`w`が無いケース（`z`型のスタブセル）は「セルなし」として扱い、`sliceRegion`が空文字で埋める。

`measureRegion`がセルへ一切触れずに寸法を返すことは、`cellAt`が呼ばれたら例外を投げるテスト用`SheetSource`で保証した（`test/tableGeometry.test.ts`）。詳細な変更内容とテスト一覧は[issue-0114](https://github.com/hat47x/markdown-matrix-injector/issues/495)の「Bの完了内容」節を参照。

この実装結果の記録で未対応とした点: `mode=table`の**strict wall-clock時間上限と本番既定budget値**（協調型budget基盤は2026-10-02、サイズ上限は2026-09-14に実装済み。[issue-0114](https://github.com/hat47x/markdown-matrix-injector/issues/495)参照）、Windows実機でOSページキャッシュを制御したcold-read性能値、CSVの原点保持は2026-10-05に修正済み。読込みとモデル構築を分ける計測経路自体は2026-10-02に`loadWorkbookFromBytes()`と`bench:workbook-load`で用意済み。
