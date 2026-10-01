# Issue: Excelに埋め込まれた画像を列挙し、位置と出典を保ったままassetsへ取り込む

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: src/core（画像のSource Adapter）、src/cli（`inspect`・`extract`）、test/fixtures、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 優先度2・D2（Extracted）・D8
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「個別取り込み」、§3「画像の読み取り」
- Dependency: issue-0193（Candidateの型）

## 背景

SIerの設計者は、画面ダンプをExcelへ貼り、図表で設計を整理する。これは現代でも有効な方式であり、MMIはこの書き方を変えさせない（ADR-0019 D0・D13）。現行のMMIはセル値しか読まず、画像は存在すら示さないため、Excelに置かれた画像をAIやMarkdownの文書から扱えない。SheetJS（コミュニティ版）は画像を解釈しないが、`bookFiles`オプションでxlsx内の`xl/media/*`と`xl/drawings/*.xml`を取り出せることを確認した（2026-10-01）。依存を増やさずに着手できる見込みがある。画像を含む実物のブックでの確認はまだない。

## Acceptance criteria
- [ ] 画像を含むテスト用のブックを用意する（架空の画面ダンプ。シート2枚以上、同じ画像の重複を含む）。作成手順を残す。
- [ ] `mmi inspect`が、画像ごとにシート、anchor（開始セル・終了セル）、元の部品名、形式、バイト数、ダイジェストを示す。画像は`Image / Screenshot`のCandidate（`observed`）とする。
- [ ] 画像の近くにある表の領域を、位置関係として示す（例: 表の直下の画像）。関係は`inferred`とする。
- [ ] `mmi extract`が、指定した画像を`assets/`へ書き出し、Markdownの画像参照と出典（ブック、シート、anchor、ダイジェスト）を出力する。原本は変更しない。
- [ ] 画像の無いブック、壊れたdrawing、未対応の形式（EMF等）で、黙って失敗せず診断を出す。
- [ ] 既存のセル値の読込み・表示が変わらないことを回帰テストで確かめる。
- [ ] xlsxから取り出した画像はCIで再現できるため、書き出し結果をGitで管理するかは利用者が選べる（ADR-0019 D14）。出典だけは必ず残す。
- [ ] 取り込んだ後も、人はExcelの画像を差し替え・移動し続けられる。原本の変更は、次回の`inspect`で「変更あり」として示す（issue-0195）。

## Validation plan
テスト用ブックで`inspect`・`extract`を実行し、書き出した画像のダイジェストがブック内の部品と一致すること、原本のダイジェストが前後で変わらないことを確かめる。Excelで同じブックを開き、anchorが実際の位置と合うことを目視で確かめる（実機確認として記録）。

## Remaining work
- 書き出し先の命名規則（ダイジェスト由来か、シートと連番か）。issue-0195の台帳と合わせて決める。
- シートや範囲をそのまま画像として取り込む`Sheet / Region snapshot`（ADR-0019 D0）は、CIで再現できる描画を優先する（D14）。[issue-0198](issue-0198-sheet-region-snapshot.md)で扱う。
- 図形（AutoShape）とconnectorは優先度3。drawingの解析で同時に見えるものは記録だけ残す。
- VS Codeで候補を採否するUIは、CLIの動作確認の後に別Issueとする。
