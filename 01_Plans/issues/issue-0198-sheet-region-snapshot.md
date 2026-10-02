# Issue: 図形やレイアウトに意味があるシート・範囲を、そのまま画像として取り込む

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: src/core（`Sheet / Region snapshot`のCandidateと描画）、src/cli（`extract`）、CIでの再現性の検査、docs。ExcelのCOM操作は手元の補助に限る
- Expected verification level: manual-e2e

## Traceability
- Related ADR/Spec: ADR-0019 D0・D13・D14（優先度2）、ADR-0017（Windows補助プロセスの前例）、ADR-0018（認知は権威を持たない）
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「シートの画像化」
- Dependency: issue-0193（Candidateの型）。issue-0194（利用者が貼った画像の取り込み）と出力・台帳の形式を合わせる

## 背景

Excel方眼紙で、罫線・セル結合・AutoShape・画面ダンプを組み合わせて図表を描く設計書は、現代でも有効な方式である（ADR-0019 D0）。こうしたシートでは、構造を読み取るより、描いた見た目をそのまま文書へ運ぶほうが意図を損なわない。画像化の方式は、ADR-0019 D14のとおり、CI（GitHub Actions等のLinux）で再現できるものを優先する。ExcelのCOM操作は忠実度が高いが、CIでは動かず、結果をGitで管理しなければならない。COMは、CIで動く方式で再現できない図形などに限る手元の補助とする。

## Acceptance criteria
- [ ] CIで動く描画方式を2つ以上比較する。候補は、xlsxの中身（セル値、罫線、結合、塗り、貼られた画像の位置）からMMI自身が描く方式と、LibreOfficeのヘッドレス変換。テスト用のシートで、Excelの見た目との違い（図形、フォント、罫線の太さ）を記録する。
- [ ] 採用した方式で、指定したシートまたは範囲（A1形式）をPNGへ書き出せる。Linux上で同じ入力から同じ画像（同じダイジェスト）が得られることを確かめる。
- [ ] CIで再現できる結果はキャッシュとして扱い、Gitに置かない。COMで作った結果だけを管理する中間生成物とし、CIでは原本のダイジェストとの照合だけを行う（ADR-0019 D14）。
- [ ] 原本は読み取り専用で開き、保存しない。処理の前後で原本のダイジェストが変わらないことを確かめる。
- [ ] 出典（ブック、シート、範囲、原本のダイジェスト、Excelの版、描画した日時）を記録する。
- [ ] 生成物に描画の方式と版を記録し、別の方式で作った結果を同一とみなさない。
- [ ] 変換器が無い、ブックが開けない、範囲が不正、図形を描けない、のいずれでも、黙って失敗せず診断を出す。他の機能（表の参照・取り込み）は止まらない。
- [ ] COMを使う場合は、利用者のExcelで作業中のブックを妨げない（別プロセスで開く、または開いているブックに触れない）。

## Validation plan
AutoShapeと画面ダンプを含む架空の設計シートを、CIで動く方式で画像化し、Excelでの見た目と比べる（目視）。同じ処理をGitHub ActionsのLinuxで実行し、手元と同じダイジェストになるかを確かめる。COMを使う場合はWindows実機で行う。原本のダイジェストを前後で比較する。Excelを開いて作業中の状態でも実行し、作業中のブックに影響が無いことを確かめる。

## 結果（最初の縦切り: MMI自身によるSVG描画）

### 方式の選択

CIの環境（Linux）とWSL上の実測では、LibreOffice（soffice）、日本語フォント、画像ライブラリ（PIL、canvas、sharp、rsvg）がいずれも無かった。そのため最初の出力形式はPNGではなくSVG（テキスト）とした。xlsxのOOXMLをMMI自身が読み、依存を増やさずに描く。フォントは埋め込まず、`font-family="'Yu Gothic','Noto Sans CJK JP',sans-serif"`の指定だけを書く。LibreOfficeのヘッドレス変換との比較と、PNG化は後続とする（Acceptance criteriaの1・2は未達）。

### 実装

- `03_Implement/src/adapters/sheetSnapshot.ts`: 純関数`renderSheetSvg({ bytes, sheet, range?, sourceLabel?, limits? })`。SVG文字列と診断を返す。描画方式と版は`MMI_SNAPSHOT_RENDERER = 'mmi-sheet-svg/1'`。
- `03_Implement/src/adapters/sheetSnapshotXml.ts`: 線形に進む小さなXML読み取り。DOCTYPEを受け付けず、要素数と入れ子の深さに上限を置く。途中で切れたXMLや対応しない終了タグは例外にし、診断へ変える。
- `03_Implement/src/cli/snapshot.ts`と`mmi.ts`の`snapshot`コマンド: `mmi snapshot <book.xlsx> --sheet <name> [--range A1:F20] -o <out.svg> [--json]`。処理の前後で原本を読み直してsha256を比べ、変わっていれば書き出さずに終了コード1にする。
- 読む情報: 列幅・行の高さ（`<cols>`、`<row ht>`、`sheetFormatPr`）、非表示の行・列、セル値（表示文字列は既存の`loadWorkbookFromBytes`のSheetJS表示書式。読めない場合は共有文字列・インライン文字列の生の値）、セル結合、`styles.xml`のfonts・fills・borders・cellXfs、テーマ色とtint、索引色、描画（`xl/drawings/*.xml`）。
- 出力の決定性: 時刻・乱数・絶対パスを含めない。数値は小数2桁に丸める。要素の順序は背景、枠線、塗り、罫線、文字、描画の順で固定する。`<metadata>`にレンダラ名と版、原本のsha256とバイト数、原本のファイル名（CLIでは`path.basename`だけ）、シート名、範囲、枠線の有無、診断の件数を入れる。
- 罫線: 隣り合うセルの境界ごとに、上（左）のセルの下（右）罫線と下（右）のセルの上（左）罫線のうち強い方を1本だけ描く。同じ線種・色の線は1つの`<path>`にまとめる。結合の内側と非表示の行・列は境界を作らない。
- 既定の範囲: 値か書式を持つセル、結合、描画オブジェクトのアンカーを含む最小の矩形。

### 検証

- `node --import tsx --test test/sheetSnapshot.test.ts test/cli.test.ts`: 18件中18件が成功（`sheetSnapshot.test.ts`は13件）。テスト用のxlsxは`test/helpers/buildStyledXlsx.ts`がコードで組み立てる（バイナリのfixtureは置かない）。確認した内容は、同じ入力で2回描いたときのバイト一致、結合セルが1つの矩形になること、塗り・罫線・テーマ色、列幅・行の高さ・非表示の寸法、画像の`<image>`埋め込み、未対応の図形の診断と枠、壊れたzip・存在しないシート・不正な範囲・範囲の上限超過、原本のダイジェストが変わらないこと、範囲外のセルと図形が出ないこと。
- `test/*.test.ts`全体: 変更前から失敗する研究層のテストだけが失敗し、この変更で増えた失敗は無い（変更前のHEADを別の場所へ展開して名前で比較した）。
- `npx tsc -p tsconfig.json --noEmit`: 既存の15件のエラーだけで、追加・変更したファイルのエラーは0件。
- 目視の代わりの構造確認（Windows側のブラウザが使えないため、SVGをテキストで検査した）。どれも2回描いてバイト一致した。
  - `04_Documentation/samples/practical/data/design.xlsx`の3シート: 状態遷移はA1:F13、700×616px、`<text>`78個（見出し6、本文72）、見出し行の塗り`#E8EDF2`と見出し文字色`#172B4D`が出た。シートの設定どおり枠線は描いていない。
  - 図形入りの架空の設計シート（`shapeDesignSheet`）: 矩形、角丸矩形、楕円、矢印付きの直線、ブロック矢印、貼り付け画像を描き、グラフ・グループ化図形・吹き出し・フリーフォームの4件を`MMI_SNAPSHOT_UNSUPPORTED_SHAPE`（位置付き）として枠で描いた。
  - `test/fixtures/excel-authored/features-excel2016.xlsx`（Excelで作ったブック）: 条件付き書式、VML（コメント等）、テーブルのスタイルが診断に出た。
  - `test/fixtures/libreoffice-fill-impact-family.xlsx`の2シートは、パッケージ内の部品のCRC・展開が壊れており（Pythonの`zipfile.testzip()`でも不正）、`MMI_SNAPSHOT_PART_UNREADABLE`（error）になった。SheetJSは読み飛ばして開く。
- 未確認: ExcelでAutoShapeを描いた実物のブック（Excelが書き出すDrawingMLの既定値、テーマの線・塗りの参照、テキストボックスの余白）との見た目の比較。Excelでの表示と並べた目視比較も未実施。Linux（GitHub Actions）での実行は未確認だが、Node.jsの標準機能だけを使い、フォント・画像処理・外部コマンドに依存しない。

### 対応できた書式・図形

- セル: 列幅・行の高さ・非表示、結合、塗りつぶし（単色、RGB・テーマ色+tint・索引色）、罫線（thin・medium・thick・double・hair・dotted・dashed・各種の一点鎖線、色、斜線）、フォント（太字・斜体・下線・取り消し線・サイズ・色）、配置（水平・垂直・インデント・折り返し）、文字列の右隣の空きセルへのはみ出しと切り取り、シートの枠線表示の設定。
- 図形（`prstGeom`）: rect、roundRect、ellipse、line、straightConnector1、bentConnector2・3、rightArrow・leftArrow・upArrow・downArrow、triangle、rtTriangle、diamond、flowChartProcess・Decision・Terminator・AlternateProcess・Connector。塗り・線（色、太さ、破線、透明度）、矢印の先端（triangle・stealth・arrow・oval・diamond）、回転・反転、図形内の文字（段落、配置、折り返し、余白）。
- 画像: PNG・JPEG・GIFをdata URIで埋め込む。トリミング（srcRect）、回転・反転。

### 未対応・近似の一覧（診断に出す）

| 種類 | 扱い | 診断 |
| --- | --- | --- |
| 上記以外の`prstGeom`（吹き出し、星、ブロック矢印の変形、フローチャートの他の形など） | 枠だけ描く | `MMI_SNAPSHOT_UNSUPPORTED_SHAPE`（`prst:<名前>`） |
| フリーフォーム（`custGeom`） | 枠だけ描く | 同（`custGeom`） |
| グループ化図形（`grpSp`） | 枠だけ描く。中の図形も描かない | 同（`group`） |
| グラフ・SmartArt・その他の`graphicFrame` | 枠だけ描く | 同（`chart`・`smartart`・`graphic-frame`） |
| `mc:AlternateContent`の描画オブジェクト、インク（`contentPart`） | 枠だけ描く | 同（`alternate-content`ほか） |
| VMLの描画（コメント、フォームコントロール） | 描かない | 同（`vml`） |
| EMF・WMF・TIFF・BMPの画像、外部リンクの画像 | 枠だけ描く | `MMI_SNAPSHOT_UNSUPPORTED_IMAGE` |
| 条件付き書式（データバー・アイコン・カラースケールを含む） | 反映しない | `MMI_SNAPSHOT_UNSUPPORTED_FORMAT`（`conditional-formatting`） |
| テーブル（ListObject）のスタイル | 反映しない | 同（`table-style`） |
| スパークライン | 描かない | 同（`sparkline`） |
| 模様の塗りつぶし、グラデーションの塗りつぶし | 単色で近似 | `MMI_SNAPSHOT_APPROXIMATED`（info、件数をまとめる） |
| 文字の回転・縦書き、縮小して全体を表示 | 横書き・元の大きさで描く | 同 |
| 図形のグラデーション・模様・テーマの塗り、独自の破線、縦書き、段落内で書式の異なる文字列 | 単色・実線・横書き・段落の最初の書式で描く | 同 |
| 図形の画像塗り（`blipFill`） | 描かない | `MMI_SNAPSHOT_UNSUPPORTED_FORMAT` |
| 診断を出さない近似 | フォント名（常に指定のフォント）、リッチテキストの文字ごとの書式（セルの書式で描く）、文字幅（全角1em・半角0.55emで推定）、列幅の換算（標準フォントの名前から数字の幅を7pxまたは8pxと推定）、tintの丸め（Excelの表示値と各成分が1ずれることがある）、ふりがな（描かない）、ページ設定・印刷範囲 | なし |

### CIでの再現性

描画はNode.jsの標準機能（`zlib`、`crypto`）と既存の依存（SheetJS）だけで行い、フォント・画像ライブラリ・外部コマンドを使わない。出力に時刻・乱数・絶対パスを含めず、同じ原本・シート・範囲・`mmi-sheet-svg/1`から同じバイト列になることをテストで確かめた。D14の区分では「再生成できるキャッシュ」に当たり、Gitに置かずに原本のダイジェストとレンダラの版で失効させられる。ただし、SVGを画面に表示したときの見た目は、閲覧環境にあるフォントで変わる（バイト列は同じ）。

### 残作業

- PNGへの書き出し（Acceptance criteria 2）。CIで動く変換器の選定（resvg等の配布物の大きさ、日本語フォントの同梱）。
- LibreOfficeのヘッドレス変換との比較（Acceptance criteria 1）。
- Excelで描いた実物のAutoShape入りブックで、既定の線・塗り・余白・文字位置を確かめ、`MMI_SNAPSHOT_RENDERER`の版を上げる。
- グループ化図形の展開（子の座標変換）、吹き出し・フローチャートの残りの形、リッチテキスト。
- Candidate（`Sheet / Region snapshot`）としての提示と、取り込み台帳（issue-0195）への記録。生成物の置き場とキャッシュの失効。

## Remaining work
- MMI自身の描画で、どこまでの図形（直線、矩形、矢印、テキストボックス）を扱えば実務の大半を覆えるか。
- LibreOfficeをCIへ入れる費用と、日本語フォントの扱い。
- COMを使う場合の補助プロセスの形（ADR-0017の補助プロセスへの追加か、別のものか）。
- 同じ範囲を描画し直したとき、画像のダイジェストが一致するか（描画の揺れ）。台帳（issue-0195）の「変更あり」の判定に効く。
- 範囲の候補をどう示すか（表の領域検出、研究層の`ambiguous_or_non_table`、利用者の選択）。
