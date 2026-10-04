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
- [x] 採用した方式で、指定した範囲（A1形式）をPNGへ書き出せる。Linux上で同じ入力から同じ画像（同じダイジェスト）が得られることを確かめる。シート全体の自動範囲決定は次段とする。
- [ ] CIで再現できる結果はキャッシュとして扱い、Gitに置かない。COMで作った結果だけを管理する中間生成物とし、CIでは原本のダイジェストとの照合だけを行う（ADR-0019 D14）。
- [x] 原本は読み取り専用で開き、保存しない。処理の前後で原本のダイジェストが変わらないことを確かめる。
- [ ] 出典（ブック、シート、範囲、原本のダイジェスト、Excelの版、描画した日時）を記録する。
- [x] 生成物に描画の方式と版を記録し、別の方式で作った結果を同一とみなさない。
- [x] 変換器が無い、ブックが開けない、範囲が不正等を専用診断として返し、snapshot以外の機能を止めない。個々の図形の描画不能を判別する診断は、方式比較と実務fixtureで追加検証する。
- [ ] COMを使う場合は、利用者のExcelで作業中のブックを妨げない（別プロセスで開く、または開いているブックに触れない）。

## Current slice（2026-10-04）

画像化方式を選ぶ前段として、原本にある図形等を取り込み結果から黙って落とさない経路を追加した。

既存のOOXML drawing readerは、埋込画像とは別にAutoShape・コネクタとgraphic frameの存在を読み取っていたが、件数は内部の集計にとどまり、利用者には表示していなかった。現在はシート単位で集計し、`MMI_DRAWING_SHAPES_NOT_EXTRACTED` と `MMI_DRAWING_GRAPHIC_FRAMES_NOT_EXTRACTED` をwarningとして返す。`graphicFrame`はグラフ以外の図を含む場合があるため、MMIは種類を断定しない。

このwarningは `mmi inspect` と既存ブックの一括取り込みに流し、下書きの「画像・図形の注意」に残す。表や埋込画像の既存処理は継続し、図形があることだけを理由に全体の取り込みを止めない。

この段階では、図形をCandidate化せず、画像化・抽出も行わない。したがって、本Issueの描画方式比較、PNG生成、再現性、provenanceに関する受入条件は未完了のままとする。まず欠落の存在を観測可能にし、その実測をもとにMMI自身の描画とLibreOfficeの比較へ進む。

## LibreOffice range snapshot（2026-10-05）

CIで利用できる描画方式の最初の製品経路として、LibreOffice Calc + Poppler `pdftoppm` を使う `mmi snapshot` を実装した。

```sh
mmi snapshot ./design.xlsx \
  --sheet 画面設計 \
  --range A1:F20 \
  --out-dir ./assets/snapshots
```

処理では、LibreOfficeを専用profile・headless・read-onlyで起動し、UNOで対象sheet以外をメモリ上だけ非表示にする。指定範囲をprint areaにし、範囲の実寸を一時ページサイズへ設定してPDFを作る。原本は保存しない。PDFは作成時刻をmetadataに含むため最終成果物にはせず、`pdftoppm`でPNGへrasterizeする。PNGをcontent-addressed assetとして保存し、`region-snapshot` Candidateを既存`mmi.ledger/v1`へ登録する。

sidecar `mmi.region-snapshot/v1` にはsource label/digest、sheet/range、原本のApplication/AppVersion（OOXMLにあれば）、LibreOffice版、pdftoppm版、font set digest、DPI、PNG digest/byte size、初回描画時刻を記録する。Candidate fingerprintのrepresentationにもrenderer版・font set・DPIを含め、別renderer環境の結果を同一content identityとして扱わない。

### 実測

この作業環境で次を確認した。

- LibreOffice: `LibreOffice 25.2.3.2 520(Build:2)`
- pdftoppm: `25.06.0`
- 同一XLSX・同一rangeを、独立したLibreOffice profileで3回PDF→PNG化した。PDF digestはCreationDateのため3回とも異なったが、150 DPIのPNG digestは3回とも `sha256:5170bbd1947cc5467ee7b5be0e80fe9f86ff2e0aa5b536f72e8f829bc879acab` で一致した。
- A1:F10の範囲実寸をページサイズへ設定したtight snapshotでは、A4余白を除いた972×454 pxのPNGになった。socket接続と製品実装で採用したpipe接続の両方で `sha256:6fe9e1ff0492d55f911f0f0799eaba8c0adb2a56665684ba5ec6c18a8b71d1f4` が一致した。
- print area外のセルはPDF textにもPNGにも含まれず、範囲内の日本語セル・罫線・塗り・埋込画像は描画された。
- 実験前後で原本XLSXのdigestは不変だった。

この実測は方式成立性の確認であり、Excel実機との視覚差の正式比較ではない。受入条件1の「MMI自身の描画との2方式比較」、受入条件3のCI cache/Git管理方針、実務fixtureでのフォント・AutoShape・connectorの差分記録は未完のまま残す。

## Validation plan
AutoShapeと画面ダンプを含む架空の設計シートを、CIで動く方式で画像化し、Excelでの見た目と比べる（目視）。同じ処理をGitHub ActionsのLinuxで実行し、手元と同じダイジェストになるかを確かめる。COMを使う場合はWindows実機で行う。原本のダイジェストを前後で比較する。Excelを開いて作業中の状態でも実行し、作業中のブックに影響が無いことを確かめる。

前段の自動テストでは、コード生成したOOXML drawingにAutoShape・コネクタ・graphic frameを含め、画像reader、`mmi inspect`、一括取り込みの下書きまでwarningが伝わることを確認する。warningがあっても、同じブックの表・埋込画像の処理は継続する。

## Remaining work
- MMI自身の描画で、どこまでの図形（直線、矩形、矢印、テキストボックス）を扱えば実務の大半を覆えるか。LibreOffice方式と同一fixtureで比較する。
- LibreOffice / python3-uno / PopplerをCIへ入れる費用と、日本語フォント固定の方法。現実装はfont set digestをprovenanceへ含める。
- COMを使う場合の補助プロセスの形（ADR-0017の補助プロセスへの追加か、別のものか）。
- 同じLinux環境内の3回描画ではPNG digest一致を確認済み。次は固定font環境を含む別Linux runner間で一致するかを確認する。
- 範囲の候補をどう示すか（表の領域検出、研究層の`ambiguous_or_non_table`、利用者の選択）。
