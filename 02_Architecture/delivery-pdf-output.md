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
| 図表番号と相互参照 | ● | `captionNumbers: true`で、表題のある表に「表1」から番号を振る。`[](#id)`はその番号になり、リンクには「（p.12）」を添える。ページ番号はWeasyPrintなどCSS Paged Mediaの生成器だけで出る。「表1-1」の章別形式は未対応 | 単体テスト（PDFでの確認は#639に記録） |
| 前付けをローマ数字にし、本文を1ページから数える | ○ | 物理ページ番号との一致を優先した | — |
| 会社指定の様式（ロゴ、表紙の罫線枠、承認欄の位置） | ◐ | CSSを追加で渡して上書きできる（`css`・`--css`）。表紙の構成の差し替えは未対応 | 単体テスト |

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
| PDF/A（長期保存） | ◐ | WeasyPrintの`--pdf-variant pdf/a-2b`で生成できる。外部の検証ツールでは確かめていない | pdfinfo（XMP metadataあり） |
| タグ付きPDF（読み上げ） | ◐ | `--pdf-tags`で生成できる。外部の検証ツールでは確かめていない | pdfinfo（Tagged: yes） |
| パスワード・印刷禁止などのセキュリティ | — | 設定しない。公共の電子納品や機関リポジトリの規程では、セキュリティを設定しないよう求める例が多い | — |
| 電子署名・タイムスタンプ | ○ | MMIの範囲外。署名ツールで付ける | — |
| 透かし（DRAFT、社外秘） | ○ | なし | — |

### 運用

| 要求 | 状態 | 現状 |
|---|---|---|
| Word（.docx）で納品する | ○ | `mmi render --to md`の結果をPandocへ渡せるが、表の体裁は確かめていない |
| 改訂箇所を示す（改訂マーク、新旧対照表） | ○ | なし |
| 1回のコマンドでPDFまで作る、複数文書を一括で作る | ○ | `mmi render`とWeasyPrintを文書ごとに実行する |
| 同じ版から同じPDFを再生成できる | ○ | 確かめていない。フォントや生成器の版で結果が変わりうる |

## 実装の要点

- front matterの読み取り、表紙、目次、柱、文書プロパティは`03_Implement/src/cli/documentExport.ts`にある。値はYAMLのfailsafe schemaで読み、すべて文字列のまま扱う。CSSの文字列へ入れる値は、`<`もエスケープして`<style>`を閉じられないようにした。
- 別紙カードの出力は`03_Implement/src/core/renderCard.ts`の`forExport`で切り替える。VS Codeのプレビューは外部アプリで開く機能のために従来どおり絶対パスを持つ。
- 印刷用CSSのうちプレビューと共通の部分（表題と表の分離防止、強調行の罫線、背景色、別紙のパス）は`03_Implement/media/markdown-matrix.css`にある。
- テストは`03_Implement/test/documentExport.test.ts`と`03_Implement/test/renderCard.test.ts`にある。

## 残る差分

優先度の高い順に並べる。受入条件と進行状況は、各GitHub Issueを正本とする。

1. 顧客指定の様式に合わせる。CSSの追加とフォント・余白・綴じ代の指定は対応した（[#635](https://github.com/hat47x/markdown-matrix-injector/issues/635)）。表紙の差し替えが残っている。SIerの案件では、発注者の様式が決まっていることが多い。
2. Word（.docx）で納品する。発注者が編集可能な形式を求める場合に必要になる。Pandocを使う経路の体裁を確かめるか、自前で出力するかを決める（[#636](https://github.com/hat47x/markdown-matrix-injector/issues/636)）。
3. PDF/Aとタグ付きPDFの適合を確かめる。veraPDFなどで検査し、満たせない条件を利用者向けに書く。あわせて、PDFまで1回のコマンドで作る経路と、複数文書の一括出力を検討する（[#637](https://github.com/hat47x/markdown-matrix-injector/issues/637)）。
4. 改訂箇所を示す。前の版との差分から、改訂マークや新旧対照表を作る（[#638](https://github.com/hat47x/markdown-matrix-injector/issues/638)）。
5. 図表番号を自動で振り、相互参照にページ番号を添える（[#639](https://github.com/hat47x/markdown-matrix-injector/issues/639)）。表の通し番号とリンクのページ番号は対応した。章別の番号（表1-1）と、PDFでの番号・ページ番号の確認が残る。

## 参考

- 公共の電子納品・機関リポジトリでは、フォントの埋め込み、セキュリティを設定しないこと、作成後のレイアウト崩れや文字の欠落の確認を求める例がある（[東京大学医学系研究科 UTRepositoryへ登録するPDFの作成について](https://www.m.u-tokyo.ac.jp/daigakuin/file/E3-03_UTRepositoryへ登録するPDFの作成について.pdf)、[東海大学](https://library.time.u-tokai.ac.jp/wysiwyg/file/download/1/84)）。
- 国の要領と自治体のガイドラインが異なる場合は、自治体側を優先すると定める例がある。発注者ごとの特記仕様を確認する必要がある（[奈良県 電子納品ガイドライン](https://www.pref.nara.jp/secure/292516/R4guidline_design0720.pdf)、[京都府 電子納品の手引き](https://www.pref.kyoto.jp/kochi/documents/r8moridenno-guide-gyomu.pdf)）。
- デジタル庁は公開するPDFでも見出しのタグと画像の代替テキストを付けると説明している（[ウェブアクセシビリティ導入ガイドブック](https://www.digital.go.jp/resources/introduction-to-web-accessibility-guidebook)）。
- WeasyPrintはPDF/A・PDF/UAの各形式と`--pdf-tags`を提供する。形式を満たすかどうかは利用者が確かめる前提である（[WeasyPrint manpage](https://dyn.manpages.debian.org/unstable/weasyprint/weasyprint.1.en.html)、[Kozea/WeasyPrint#2574](https://github.com/Kozea/WeasyPrint/issues/2574)）。
