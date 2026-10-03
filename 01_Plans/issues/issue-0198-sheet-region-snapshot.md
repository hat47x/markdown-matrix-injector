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

## Current slice（2026-10-04）

画像化方式を選ぶ前段として、原本にある図形等を取り込み結果から黙って落とさない経路を追加した。

既存のOOXML drawing readerは、埋込画像とは別にAutoShape・コネクタとgraphic frameの存在を読み取っていたが、件数は内部の集計にとどまり、利用者には表示していなかった。現在はシート単位で集計し、`MMI_DRAWING_SHAPES_NOT_EXTRACTED` と `MMI_DRAWING_GRAPHIC_FRAMES_NOT_EXTRACTED` をwarningとして返す。`graphicFrame`はグラフ以外の図を含む場合があるため、MMIは種類を断定しない。

このwarningは `mmi inspect` と既存ブックの一括取り込みに流し、下書きの「画像・図形の注意」に残す。表や埋込画像の既存処理は継続し、図形があることだけを理由に全体の取り込みを止めない。

この段階では、図形をCandidate化せず、画像化・抽出も行わない。したがって、本Issueの描画方式比較、PNG生成、再現性、provenanceに関する受入条件は未完了のままとする。まず欠落の存在を観測可能にし、その実測をもとにMMI自身の描画とLibreOfficeの比較へ進む。

## Validation plan
AutoShapeと画面ダンプを含む架空の設計シートを、CIで動く方式で画像化し、Excelでの見た目と比べる（目視）。同じ処理をGitHub ActionsのLinuxで実行し、手元と同じダイジェストになるかを確かめる。COMを使う場合はWindows実機で行う。原本のダイジェストを前後で比較する。Excelを開いて作業中の状態でも実行し、作業中のブックに影響が無いことを確かめる。

前段の自動テストでは、コード生成したOOXML drawingにAutoShape・コネクタ・graphic frameを含め、画像reader、`mmi inspect`、一括取り込みの下書きまでwarningが伝わることを確認する。warningがあっても、同じブックの表・埋込画像の処理は継続する。

## Remaining work
- MMI自身の描画で、どこまでの図形（直線、矩形、矢印、テキストボックス）を扱えば実務の大半を覆えるか。
- LibreOfficeをCIへ入れる費用と、日本語フォントの扱い。
- COMを使う場合の補助プロセスの形（ADR-0017の補助プロセスへの追加か、別のものか）。
- 同じ範囲を描画し直したとき、画像のダイジェストが一致するか（描画の揺れ）。台帳（issue-0195）の「変更あり」の判定に効く。
- 範囲の候補をどう示すか（表の領域検出、研究層の`ambiguous_or_non_table`、利用者の選択）。
