# 納品用PDF出力の要求と差分

- 確認日: 2026-10-21
- 対象: `mmi render --to html`で展開したHTMLを、WeasyPrint 69.0でPDFにする経路（[利用マニュアル](../04_Documentation/user-manual.md#pdfを作る)の確認済み経路）
- 確認環境: WSL2（Ubuntu）、Noto Sans CJK JP、WeasyPrint 69.0。見本は[sier-design](../04_Documentation/samples/sier-design/design-doc-sample.md)、[10 印刷](../04_Documentation/samples/practical/10-print.md)、[14 納品用の体裁](../04_Documentation/samples/practical/14-delivery.md)
- 正本の関係: 進行状況と受入条件はGitHub Issueを正本とする。この資料は、SIerの顧客が求める体裁と現状の差分を分析したものである。

## 結論

**2026-10-21の改修前は顧客へそのまま納品できる水準になかった。** 表の展開・改ページ・用紙の向きは再現できたが、次の欠陥が残っていた。

1. 別紙カードに作成者のPCの絶対パスが印字された。リポジトリの見本PDFには、生成した環境のパス（`/sessions/.../mnt/...`）が残っていた。フォルダー名にユーザー名や顧客名を含む環境では、情報漏えいになる。
2. PDFの文書プロパティ「タイトル」が、どの文書でも「MMI 文書出力」になっていた。
3. 表紙、承認欄、文書番号、版数、機密区分、総ページ数、ページ番号付きの目次がなかった。
4. ヘッダー・フッターとコードは明朝体（IPA明朝、DejaVu Serif）に置き換わり、本文のゴシック体と混在した。
5. 表題（caption）と表、見出しと表が別のページに分かれた。横向きの表の前の見出しが、縦向きのページの末尾に1行だけ残った。
6. Markdownで書いた表に罫線がなかった。YAMLのfront matterは、罫線と見出しとして本文に印字された。

**改修後は一般的な設計書PDFの基本体裁を満たす。** 表紙・承認欄・目次・柱・文書プロパティ・PDFしおりが付き、上記の欠陥はなくなった。ただし、顧客が様式を指定する場合や、Word形式・改訂マーク・電子署名を求める場合には、まだ応えられない（[残る差分](#残る差分)）。

## 顧客から求められる体裁と対応状況

記号は、●が対応済み、◐が一部対応、○が未対応を表す。「確認方法」はこの資料で確かめた方法である。

### 書誌と構成

| 要求 | 状態 | 現状 | 確認方法 |
|---|---|---|---|
| 表紙（文書名・案件名・版数・日付・宛先・発行者） | ● | front matterの`cover: true`で生成する | 単体テスト、14のPDFを画像で確認 |
| 承認欄（承認・審査・作成などの押印欄） | ● | `approvals`の役割名で空欄を作る。配置は表紙右下の1種類 | 同上 |
| 文書番号・版数・機密区分を各ページに出す | ● | ヘッダー左に文書名、右に機密区分。フッター左に文書番号と版数 | 同上 |
| ページ番号「n / N」 | ● | フッター中央。表紙から数え、PDF閲覧ソフトの番号と一致させる | 同上 |
| ページ番号付きの目次 | ● | `toc: true`で`##`・`###`から生成する | 同上 |
| PDFしおり（電子納品で目次と同じ章・節） | ● | WeasyPrintが見出しから作る。目次ページも入る | pypdfでしおりを列挙 |
| 文書プロパティ（タイトル・作成者・サブタイトル） | ● | front matterまたは最初の`#`見出しから入れる | pdfinfo |
| 改訂履歴 | ● | ExcelやCSVの台帳をMMI参照で表示する。新しい機能は足していない | 14のPDF |
| 図表番号と相互参照 | ● | `captionNumbers: true`で、表題のある表に「表1」から番号を振る。`[](#id)`はその番号になり、リンクには「（p.12）」を添える。ページ番号はWeasyPrintなどCSS Paged Mediaの生成器だけで出る。「表1-1」の章別形式は未対応 | 単体テストと、WeasyPrint 69.0・游ゴシックで作った4ページのPDF（表の番号、リンクの「（p.N）」、フッターの「n / N」が実際のページと一致） |
| 前付けをローマ数字にし、本文を1ページから数える | ○ | 物理ページ番号との一致を優先した | — |
| 会社指定の様式（ロゴ、表紙の罫線枠、承認欄の位置） | ● | CSSの追加（`css`・`--css`）と、顧客指定の表紙のHTML（`coverTemplate`・`--cover`）で対応する。Wordは`--reference-doc`で様式を渡す。表紙のHTMLはWordには使えない | 単体テスト、PDFを画像で確認 |

### 印刷と組版

| 要求 | 状態 | 現状 | 確認方法 |
|---|---|---|---|
| A4縦とA4横・A3横の混在 | ● | `orientation`に加え、`paper: A3`で用紙全体をA3にできる | 単体テスト、14・sier-designのPDF |
| 見出し・表題を表から切り離さない | ● | 見出しと表題の直後で改ページしない。見出し直後の改ページ・横向きは見出しごと送る | 単体テスト、PDFを画像で確認 |
| 表の見出し行の繰り返し、行の途中で改ページしない | ● | `thead`を各ページに出し、行の分割を避ける | 既存のCSS |
| モノクロ印刷でも強調行が分かる | ● | 黄色の背景に加え、行頭に太い罫線を引く | PDFを画像で確認 |
| ブラウザ印刷で表の背景色を落とさない | ● | `print-color-adjust`を指定した。WeasyPrintは未知の指定として警告を出すが、出力に影響しない | — |
| 英単語を途中で折り返さない | ● | セルからはみ出すときだけ折り返す | sier-designのPDFで退行を確認して修正 |
| 両面印刷の綴じ代（左右の余白の入れ替え） | ● | front matterの`gutter`と`margin`で指定する | 単体テスト |
| 「以下余白」「本ページは白紙」 | ○ | 「以上」は本文に書ける | — |

### 文字とフォント

| 要求 | 状態 | 現状 | 確認方法 |
|---|---|---|---|
| フォントの埋め込み | ● | WeasyPrintがサブセットを埋め込む | pdffonts |
| 本文・柱・コードを同系統の書体に揃える | ● | ゴシック体の候補を`html`要素に指定し、柱にも効くようにした | pdffonts（14ではNoto Sans CJK JPの2書体だけ） |
| 指定フォント（MS明朝、游明朝、UDフォントなど） | ● | front matterの`font`で指定する。PDFを作る環境にフォントが要る | 単体テスト |
| 絵文字・機種依存の記号 | ◐ | 絵文字フォントを候補に加えたが、フォントがない環境では□になる | WeasyPrintの警告 |
| 和文の斜体を避ける | ○ | `*強調*`は斜体（機械的な傾斜）になる | pdffonts（Oblique） |
| ファイルサイズ | ◐ | 和文フォントを3書体使うと約800KBになる（sier-designの見本） | ファイルサイズ |

### 保存・アクセシビリティ・情報管理

| 要求 | 状態 | 現状 | 確認方法 |
|---|---|---|---|
| 作成者の環境情報を出さない | ● | 別紙カードは相対パスだけを出す。HTMLにも絶対パスと外部アプリ起動リンクを入れない | 単体テスト、HTMLとPDFの文字列検査 |
| PDF/A（長期保存） | ● | WeasyPrintの`--pdf-variant pdf/a-2b`または`pdf/a-2a`で生成する。見本（14）はveraPDF 1.30.3でPDF/A-2b（144規則）・PDF/A-2a（153規則）とも違反なし。[検証記録](#pdfaタグ付きpdfの検証記録) | veraPDF |
| タグ付きPDF（読み上げ） | ● | `--pdf-tags`で生成する。`pdf/ua-1`の指定で、見本（14）はveraPDFのPDF/UA-1（106規則）に違反なし。画像・数式・フォームを含む文書は未確認 | veraPDF |
| パスワード・印刷禁止などのセキュリティ | — | 設定しない。公共の電子納品や機関リポジトリの規程では、セキュリティを設定しないよう求める例が多い | — |
| 電子署名・タイムスタンプ | ○ | MMIの範囲外。署名ツールで付ける | — |
| 透かし（DRAFT、社外秘） | ○ | なし | — |

### 運用

| 要求 | 状態 | 現状 |
|---|---|---|
| Word（.docx）で納品する | ● | `mmi docx`でPandoc経由。見本（14）をWord 16.0.19127で開いて確認した。[検証記録](#word納品の検証記録) |
| 改訂箇所を示す（改訂マーク、新旧対照表） | ● | `--base`・`--base-rev`で前の版と比べ、変更箇所に印を付け、最後に変更ごとの変更前・変更後の新旧対照表を付ける | 単体テスト、PDFを画像で確認 |
| 1回のコマンドでPDFまで作る、複数文書を一括で作る | ○ | `mmi render`とWeasyPrintを文書ごとに実行する |
| 同じ版から同じPDFを再生成できる | ○ | 確かめていない。フォントや生成器の版で結果が変わりうる |

## Word納品の検証記録

2026-11-04、Pandoc 2.9.2.1とMicrosoft Word 16.0.19127.20860（Windows 11）で、見本`14-delivery`ほかを`mmi docx`で作り、Wordで開いてPDFに書き出して確認した。

**決めたこと。** 経路は、Pandoc経由の`mmi docx`とした。`mmi render --to md`の結果をPandocに渡すだけでは、表に罫線がなく、見出し行も繰り返されず、改ページ・横向き・表紙・ヘッダーとフッターがすべて落ちる。Pandocは「Markdownから文書へ」の変換器で、納品文書の体裁を持たないためである。そこでMMIが、Pandocの生のOOXML（`raw_attribute`）と、MMI専用の参照用Wordファイル（`--reference-doc`）で、不足を足す。Wordファイルの書き出しをMMIが一から作る案は、Pandocの変換（表・画像・書式）を作り直すことになるため採らなかった。会社の様式がある場合は、利用者の参照用Wordファイルに差し替えられる。

| 項目 | 結果 | 確認 |
|---|---|---|
| 見出し・段落・箇条書き・表 | 再現 | Word |
| 表の罫線、見出し行の網掛けと太字 | 再現 | Word |
| 見出し行を各ページで繰り返す | 再現（60行の表が3ページにまたがり、2・3ページ目に見出し行） | Word |
| 表の行をページの途中で切らない | 設定した（`cantSplit`） | XML・単体テスト |
| 表題（Captionスタイル、表と同じページ） | 再現 | Word |
| 表題の自動番号と「表3（p.12）」の相互参照 | 再現。ページ番号はWordの更新で入る | Word |
| 改ページ（`pageBreak=before`・`after`・`both`） | 再現 | Word |
| 横向きのページ（`orientation=landscape`） | 再現。同じ向きの表が続くときは1つの区切りを共有する | Word |
| 表紙（文書番号・機密区分・宛先・案件名・文書名・版数・日付・発行者・承認欄） | 再現 | Word |
| 目次（ページ番号付き） | 再現。Wordで開くときのフィールド更新が要る | Word |
| ヘッダー・フッター（文書名・機密区分・文書番号・版数・ページ番号） | 再現。文書のプロパティのフィールドで入れる | Word |
| 文書のプロパティ（タイトル・件名・作成者・キーワード） | 再現 | Word（ヘッダーのフィールド） |
| 用紙（A4・A3）・余白 | 再現（front matterの`paper`・`margin`） | XML・単体テスト |
| 書体 | `font`の先頭を指定。その書体のない環境では別の書体になる | XML・単体テスト |
| 別紙カード | 引用の段落になる。枠付きのカードにはならない | Word |
| 変更箇所の表示（`--base`） | 未対応 | — |
| `--css`（顧客指定のCSS） | 使えない。Wordでは`--reference-doc`で様式を渡す | — |
| PDF/A・タグ付きPDF | 対象外（Wordの「PDFとして保存」で別に作る） | — |
| 綴じ代（`gutter`） | 余白の「とじしろ」として入る。奇数・偶数ページで左右を入れ替えない | XML |
| Word以外のビューア（LibreOfficeなど） | 未確認 | — |

**見つかった不具合。** Wordが「ファイルが壊れている可能性があります」と開けなかった。原因は、Pandocが変換のときにヘッダーとフッターの関係ID（`rId`）を振り直すのに対して、MMIが書いた区切りの生のOOXMLが古いIDを参照していたことだった。区切りは目印だけを書き、Pandocの変換後に、出力にある最後のセクションの設定から、実際のIDを入れる方式にした。Wordのような厳密なビューアで開かないと分からない種類の不具合なので、Wordでの確認を省けない。

**限界。**

- Pandocは2.9.2.1と3.11で確かめた（見本をWordで開いてPDFに書き出し、表紙・目次・ヘッダーとフッター・表・横向きのページが同じに再現された）。3.11では、Pandoc自身が表の見出し行（`tblHeader`）を付け、表は固定レイアウトで列幅が等分になる（2.9.2.1は自動幅）。MMIは見出し行を重ねて入れず、行を分割しない指定だけを足す。列幅が等分のため、短い列でも文字が折り返されることがある。その間の版は未確認である。
- 目次とページ番号のフィールドは、Wordが更新する。開いたときの確認ダイアログは避けられない。
- 実機で確かめたのはWindowsのWord 1版だけで、macOS版Wordやブラウザー版は確かめていない。

## PDF/A・タグ付きPDFの検証記録

2026-10-28、[veraPDF](https://verapdf.org/) 1.30.3（Dockerイメージ`verapdf/cli`）で、見本`14-delivery.pdf`の元のHTMLをWeasyPrint 69.0の3種類の指定でPDFにして検査した。

| WeasyPrintの指定 | 検査した形式 | 結果 |
|---|---|---|
| `--pdf-variant pdf/a-2b --pdf-tags` | PDF/A-2b | 144規則に合格、違反0 |
| `--pdf-variant pdf/a-2a --pdf-tags` | PDF/A-2a | 153規則に合格、違反0 |
| `--pdf-variant pdf/ua-1 --pdf-tags` | PDF/UA-1 | 106規則に合格、違反0 |

- 1つのPDFに書ける形式は、WeasyPrintでは1つだけである。PDF/Aの指定ではPDF/UAの識別情報が入らず、PDF/UAの指定ではPDF/Aの識別情報が入らない。保存とアクセシビリティの両方が必要な場合は、アクセシビリティも保てるPDF/A-2aを選ぶか、2つのPDFを作る。
- この検査で、MMIの出力に直すべき点が1つ見つかった。表紙の文書名が`div`で、文書の最初の見出しが`h2`になるため、PDF/UA-1の見出しの規則（7.4.2）に違反していた。表紙の文書名を`h1`にして解消した。
- 検査の対象は、画像・数式・フォームを含まない見本1点である。画像を含む文書は、代替テキストが必要になるため、別に確かめる。
- veraPDFが確かめるのは、機械で判定できる規則だけである。読み上げの順序や代替テキストの内容など、人が確かめる項目は含まない。

検査のコマンドは次のとおりである（DockerとWeasyPrintが要る）。

```bash
weasyprint --pdf-variant pdf/a-2a --pdf-tags 文書.html 文書.pdf
docker run --rm -v "$PWD":/data verapdf/cli:latest -f 2a --format text /data/文書.pdf
```

`-f`には`2b`（PDF/A-2b）、`2a`（PDF/A-2a）、`ua1`（PDF/UA-1）を指定する。

## 実装の要点

- `mmi pdf`（`03_Implement/src/cli/pdf.ts`）は、書き出したHTMLを標準入力でWeasyPrintへ渡す。文書の場所を`--base-url`にするので、相対パスの画像やリンクも解決する。出力は一時ファイルへ書いてから置き換え、失敗しても前のPDFを壊さない。WeasyPrintはMMIに同梱しない。
- front matterの読み取り、表紙、目次、柱、文書プロパティは`03_Implement/src/cli/documentExport.ts`にある。値はYAMLのfailsafe schemaで読み、すべて文字列のまま扱う。CSSの文字列へ入れる値は、`<`もエスケープして`<style>`を閉じられないようにした。
- 別紙カードの出力は`03_Implement/src/core/renderCard.ts`の`forExport`で切り替える。VS Codeのプレビューは外部アプリで開く機能のために従来どおり絶対パスを持つ。
- 印刷用CSSのうちプレビューと共通の部分（表題と表の分離防止、強調行の罫線、背景色、別紙のパス）は`03_Implement/media/markdown-matrix.css`にある。
- テストは`03_Implement/test/documentExport.test.ts`と`03_Implement/test/renderCard.test.ts`にある。

## 残る差分

優先度の高い順に並べる。受入条件と進行状況は、各GitHub Issueを正本とする。

1. 顧客指定の様式に合わせる。CSS・書体・余白・綴じ代と、顧客指定の表紙は対応した（[#635](https://github.com/hat47x/markdown-matrix-injector/issues/635)）。Wordの表紙をテンプレートから差し替えることは、`--reference-doc`の様式の範囲でしか対応していない。SIerの案件では、発注者の様式が決まっていることが多い。
2. Word（.docx）で納品する。`mmi docx`で対応した。Word 16.0.19127で確認した。変更箇所の表示と別紙カードの体裁が残っている（[#636](https://github.com/hat47x/markdown-matrix-injector/issues/636)）。
3. PDFまで1回のコマンドで作る経路と複数文書の一括出力は`mmi pdf`で対応した。PDF/Aとタグ付きPDFの適合は見本1点で確かめた。ここまでは[#637](https://github.com/hat47x/markdown-matrix-injector/issues/637)で対応した。画像を含む文書の確認が残っている（[#771](https://github.com/hat47x/markdown-matrix-injector/issues/771)）。
4. 改訂箇所を示す。改訂マークと新旧対照表は対応した（[#638](https://github.com/hat47x/markdown-matrix-injector/issues/638)）。Wordの出力（`mmi docx`）では、まだ変更箇所を示せない。
5. 図表番号を自動で振り、相互参照にページ番号を添える（[#639](https://github.com/hat47x/markdown-matrix-injector/issues/639)）。表の通し番号とリンクのページ番号は対応し、WeasyPrint 69.0でのPDFでも確かめた（2026-10-27）。章別の番号（表1-1）が残る。

## 参考

- 公共の電子納品・機関リポジトリでは、フォントの埋め込み、セキュリティを設定しないこと、作成後のレイアウト崩れや文字の欠落の確認を求める例がある（[東京大学医学系研究科 UTRepositoryへ登録するPDFの作成について](https://www.m.u-tokyo.ac.jp/daigakuin/file/E3-03_UTRepositoryへ登録するPDFの作成について.pdf)、[東海大学](https://library.time.u-tokai.ac.jp/wysiwyg/file/download/1/84)）。
- 国の要領と自治体のガイドラインが異なる場合は、自治体側を優先すると定める例がある。発注者ごとの特記仕様を確認する必要がある（[奈良県 電子納品ガイドライン](https://www.pref.nara.jp/secure/292516/R4guidline_design0720.pdf)、[京都府 電子納品の手引き](https://www.pref.kyoto.jp/kochi/documents/r8moridenno-guide-gyomu.pdf)）。
- デジタル庁は公開するPDFでも見出しのタグと画像の代替テキストを付けると説明している（[ウェブアクセシビリティ導入ガイドブック](https://www.digital.go.jp/resources/introduction-to-web-accessibility-guidebook)）。
- WeasyPrintはPDF/A・PDF/UAの各形式と`--pdf-tags`を提供する。形式を満たすかどうかは利用者が確かめる前提である（[WeasyPrint manpage](https://dyn.manpages.debian.org/unstable/weasyprint/weasyprint.1.en.html)、[Kozea/WeasyPrint#2574](https://github.com/Kozea/WeasyPrint/issues/2574)）。
