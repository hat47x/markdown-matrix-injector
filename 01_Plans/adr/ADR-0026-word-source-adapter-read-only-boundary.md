# ADR-0026: Word文書を読み取り専用のSource Adapterとして扱う境界

- Status: Proposed
- Date: 2026-10-20
- Deciders: MMI Lead Agent（実装案の提示。採否はHuman Sponsor）
- Scope: `src/adapters`（.docxのOOXML読込み）、`src/application`（表・画像の明示抽出）、`src/cli`（`inspect`・`extract`）、Candidate契約、利用者文書
- Related: [ADR-0019](ADR-0019-ai-era-sier-document-value-and-policy.md) D4・D5・D6・D10・D13、[ADR-0018](ADR-0018-cognitive-assistance-plane.md)、[ADR-0020](ADR-0020-requirement-oriented-cognition-method-selection.md)、Issue #531

## Context

業務設計書の現実の入口はExcelだけではない。数百ページのWord文書には、見出し、表、図、コメントが混在し、Excelと同じく「人が書き続ける正本」として扱う必要がある。ADR-0019 D5は、画像・図形を含むOffice文書をSource Adapterの候補として挙げている。しかし、Wordを単に読めるようにするだけでは、次の境界が曖昧になる。

1. Wordの見出しを、明示されたスタイルとして読むのか、太字・文字サイズから推測するのか。
2. 表の見出し行を、原本が述べた事実として扱うのか、Markdown出力の都合として扱うのか。
3. 変更履歴、ヘッダ・フッタ、脚注、テキストボックス、SmartArt、外部リンク画像を、初版の観測範囲に含めるのか。
4. WordをMMI記法の参照先（Linkedのtarget）にするのか。それは記法v1の範囲を広げることになる。
5. コメントを「採用・却下できる候補」として扱うのか、原本の注記として読むだけにするのか。

## Decision

Word（`.docx`）を、**読み取り専用のSource Adapter**として追加する。観測するのは原本が明示した構造だけとし、意味の推定や原本の変更は行わない。

1. **観測する構造を限定する。** 見出しは、段落の`w:pStyle`が解決できる見出しスタイルである場合、または`w:outlineLvl`が明示されている場合だけ`section` Candidateにする。太字・文字サイズ・段落位置からの見出し推定はしない。表は`w:tbl`の行・セル・`gridSpan`・`vMerge`を`table-range` Candidateにし、見出し行は`w:tblHeader`が明示されたときだけ`observed`とする。画像は`w:drawing`/`w:pict`の埋込み関係を`image` Candidateにし、コメントは`word/comments.xml`の本文と`w:commentRangeStart`の位置を`note` Candidateにする。さらに、これらの明示見出しからSection Treeを組み立て、`preamble`（最初の見出しより前のブロック）と、各見出しが所有する`contentPaths`（次の見出しまでのトップレベル段落・表）を返す。レベルの飛びは補完せず、最も近い低いレベルの見出しを親にする。
2. **原本が述べていないことは`abstained`にする。** 見出し行の指定がない表は、`header-row` Claimを`abstained`にする。Markdown投影で先頭行を見出しとして使うのは変換上の選択であり、原本の主張にしない。入れ子表は外側セルへ平坦化せず、別Candidateとして観測して診断を残す。
3. **抽出は明示操作に限る。** `mmi extract`は、`mmi inspect --json`が返したレビュー時fingerprintの一致を要求し、表はGFMのMarkdown資産、画像は内容アドレスな画像資産として書き出す。原本、外部リンク、未レビューの候補を自動で書き換えない。外部リンク画像は取得せず診断に残す。
4. **WordをLinkedのtargetにしない。** 今回の追加はExtractedの入口であり、MMI記法から`.docx`の表・範囲を直接参照する経路ではない。WordをLinkedのtargetにするかは、記法v1の範囲と参照解決の契約を別ADRで判断する。
5. **初版の非対象を明示する。** 変更履歴の解決、ヘッダ・フッタ、脚注・文末脚注、テキストボックス内の本文、SmartArt・グラフの意味解釈、`.doc`（旧形式）、コメントの解決状態の変更、Wordの描画再現は対象外とする。これらは必要になった時点で、Candidate契約のどの行を強くするかを示してから追加する。
6. **優先順位を変えない。** Word Adapterの実装は、ADR-0019 D0・D13が定めるExcel併用執筆の受入（#514）を置き換えない。両者は同じCandidate契約とledgerを使う別の入口として並ぶ。

## Consequences

- **Good:** Wordの見出し・表・画像・コメントを、Excelと同じCandidate契約、同じ`observed`/`inferred`/`abstained`、同じレビュー・ledger・fingerprint再照合で扱える。`section` Candidateの最初の生成元ができ、見出し階層と配下ブロックを`docx.sectionTree`として参照できるため、Tree・Sectionの研究を製品の契約へ合流させる足場になる。新しい実行時依存を足さず、既存の`zipReader`と`saxes`だけで読める。1つの画像やコメントが壊れても、他の候補と診断が残る。
- **Bad:** Wordの見出し判定はスタイルに依存するため、見た目だけの見出し（直接書式）は拾えない。表の結合セルはGFMで表現できず、Markdown投影では空セルまたは重複として現れる。コメントはレビュー材料であり、抽出資産にはならない。変更履歴を含む文書では、削除済みの文字を現在の本文と誤認しないよう`w:delText`を除外するが、変更の受入・却下は利用者に残る。`.docx`以外のWord形式は別途対応が要る。
- **Traceability:** 実装は`src/adapters/docxSourceAdapter.ts`、`src/application/extractDocx.ts`、`src/core/mediaFormat.ts`、`src/cli/mmi.ts`。試験は`test/docxSourceAdapter.test.ts`、`test/docxCli.test.ts`、`test/docxCommand.test.ts`、`test/docxRealFixture.test.ts`。残作業はIssue #531のコメントと後続Issueに記す。

## Traceability

- Related Issues: [#531](https://github.com/hat47x/markdown-matrix-injector/issues/531)
- Related Docs: [Semantic Candidate契約 v1](../../02_Architecture/candidate-contract-v1.md)、[Word文書の読み取り](../../04_Documentation/word-source-adapter.md)
