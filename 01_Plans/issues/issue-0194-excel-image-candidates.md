# Issue: Excelに埋め込まれた画像を列挙し、位置と出典を保ったままassetsへ取り込む

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: src/core（画像のSource Adapter）、src/cli（`inspect`・`extract`）、test/fixtures、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019優先度2・D2（Extracted）・D8、ADR-0020
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「個別取り込み」、§3「画像の読み取り」
- Dependency: issue-0193（Candidateの型）

## 背景

SIerの設計者は、画面ダンプをExcelへ貼り、図表で設計を整理する。これは現代でも有効な方式であり、MMIはこの書き方を変えさせない（ADR-0019 D0・D13）。現行のMMIはセル値しか読まず、画像は存在すら示さないため、Excelに置かれた画像をAIやMarkdownの文書から扱えない。SheetJS（コミュニティ版）は画像を解釈しないが、`bookFiles`オプションでxlsx内の`xl/media/*`と`xl/drawings/*.xml`を取り出せることを確認した（2026-10-01）。依存を増やさずに着手できる見込みがある。画像を含む実物のブックでの確認はまだない。

## Acceptance criteria
- [x] 画像を含むテスト用のブックを用意する（架空の画面ダンプ。シート2枚以上、同じ画像の重複を含む）。作成手順を残す。
- [x] `mmi inspect`が、画像ごとにシート、anchor（開始セル・終了セル）、元の部品名、形式、バイト数、ダイジェストを示す。OOXML relation / media / anchorから得る情報はM0の`observed + deterministic`とする。
- [x] 画像の近くにある表の領域を、まずM1の決定論的な幾何（距離・重なり・包含等）で位置関係として示す。関係は`inferred + deterministic`とする。fixtureで不足が確認されるまでM3/M4へ上げない。
- [x] `mmi extract`が、指定した画像を`assets/`へ書き出し、Markdownの画像参照と出典（ブック、シート、anchor、ダイジェスト）を出力する。原本は変更しない。
- [x] 画像の無いブック、壊れたdrawing、未対応の形式（EMF等）で、黙って失敗せず診断を出す。
- [x] 既存のセル値の読込み・表示が変わらないことを回帰テストで確かめる。
- [x] xlsxから取り出した画像はCIで再現できるため、書き出し結果をGitで管理するかは利用者が選べる（ADR-0019 D14）。出典だけは必ず残す。
- [x] 取り込んだ後も、人はExcelの画像を差し替え・移動し続けられる。原本の変更は、次回の`inspect`で`changed` / `stale`として示す（issue-0195）。

## Validation plan
テスト用ブックで`inspect`・`extract`を実行し、書き出した画像のダイジェストがブック内の部品と一致すること、原本のダイジェストが前後で変わらないことを確かめる。Excelで同じブックを開き、anchorが実際の位置と合うことを目視で確かめる（実機確認として記録）。

## 結果（2026-10-01）
- 実装: `src/core/zipReader.ts`（依存なしの読み取り専用zip。エントリ数・展開サイズの上限、CRC検証）、`src/adapters/excelImageAdapter.ts`（OOXML → `image`のCandidate。契約は[Candidate契約 v1](../../02_Architecture/candidate-contract-v1.md)§3b）、`src/cli/extract.ts`（`mmi extract`）、`mmi inspect`の画像一覧。テストは`test/excelImageAdapter.test.ts`・`test/imageCli.test.ts`（計14件）。
- テスト用ブックは**コードで生成**する（`test/helpers/buildXlsxWithImages.ts`）。バイナリのfixtureを置かず、CIで再現でき、シート複数・同一画像の重複・1セル／2セル／絶対anchor・EMF・欠けたmedia・外部リンク・途中で切れたdrawing・壊れたzipを作り分けられる。これが作成手順を兼ねる。
- 書き出し名は`assets/<sha256先頭12桁>.<拡張子>`。同じ画像は置き場所が違っても1ファイルに集約され、Excelで画像を動かしても名前が変わらない。同名で内容が違うファイルは上書きしない。再実行は何も変えない。
- **実Excelでの確認（COM、一時フォルダ）:** PNG・JPEG各1種を、2シート・4か所（同じPNGを2回）に貼ったブックを作り、Excel自身が報告する各画像の開始・終了セルと`mmi inspect`のanchorを比べた。4枚すべて完全一致（D1:G6、A7:D12、I9:L14、B2:E7）。書き出したファイルは、貼り付けた元のPNG・JPEGとバイト一致し、原本のsha256は前後で不変。近くの表との関係（右・隣接1セル、下・距離3セル）も位置どおり。
- 診断は、EMF（列挙するが書き出さない）、欠けたmedia、外部リンク、途中で切れたdrawing、zipでないファイル、CRC不一致で確認した。`.xls`（旧形式）は画像を読まない旨を警告する。

## Follow-up
- 画像の変更検知は[issue-0195](issue-0195-import-ledger.md)で完了した。content fingerprint変更は`changed`、同じcontentでreview basisが変わった場合は`stale`、移動候補はlineage evidenceとして提示する。
- 図形（AutoShape）とconnector、グラフは数だけ記録している。解釈は優先度3（[issue-0199](https://github.com/hat47x/markdown-matrix-injector/issues/502)以降）。
- シートや範囲をそのまま画像として取り込む`Sheet / Region snapshot`は[issue-0198](https://github.com/hat47x/markdown-matrix-injector/issues/501)。
- VS Codeで候補を採否するUIは、CLIの動作確認が済んだので[issue-0202](https://github.com/hat47x/markdown-matrix-injector/issues/505)で扱える。
- 画像を多数含む大きなブックでの読込み時間・記憶域は未測定（ギャップ分析§2「応答性」）。
