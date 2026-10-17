# HTML断片の選択・保存・文書再構成 — 設計境界 v0

- 状態: **Proposed / 検討中**（製品仕様の採用・実装・実機検証を意味しない）
- 日付: 2026-10-17
- 対応課題: [#553](https://github.com/hat47x/markdown-matrix-injector/issues/553)
- 原則の正本: [ADR-0019](../01_Plans/adr/ADR-0019-ai-era-sier-document-value-and-policy.md) D0 / D2–D4 / D6–D8 / D10–D13
- 関連契約: [Semantic Candidate v1](candidate-contract-v1.md)、[製品要求](../00_Prompt/requirements.md)
- 目的: HTMLの特定領域・図表を選択的に利用し、必要なときには独立資産へ分割する。原本の共存・継続利用を妨げない。

## 1. 問題と目指す使い方

一つのHTML文書に、ヘッダーやナビゲーション、複数の章節、表、SVG、Mermaidの定義、画像とキャプションが混在する場合、納品用Markdownへ必要な部分だけを取り込みたい。さらに、章や図表を独立したファイルへ保存して参照をつなぎ直せれば、モノリス文書を段階的に分解・再構成できる。

価値の中心は一律なHTML→Markdown変換ではない。**原本を尊重したまま、構造によって選択し、出所と依存関係を追跡し、用途別の文書に組み立てられること**である。大きな表・Excel数式など、原形式で管理し続ける方が合理的な情報はLinkedのままでよい。

## 2. 確認できている既存基盤とギャップ

| 領域 | 現在の根拠 | 本件では未確認・未実装 |
| --- | --- | --- |
| Semantic Candidate | Table / Image / Tree等のkind、locator、observed/inferred、fingerprint、provenance、レビュー状態を分離 | HTMLのSection / Link / Diagram候補とDOM位置の表現 |
| 取り込みと保存 | #503 のExcel一括取り込みで原本snapshot、台帳、rollbackなどの実装が記録済み | HTML断片を複数ファイルへ一括保存する接続と障害時の整合性 |
| Detached | #499 の表・画像などへのmaterialize、freshness、artifact closureの実装記録 | HTML由来の章・図・相互参照を含む文書群の閉包検査 |
| 影響分析 | #515 はLinked / Extracted / 通常Markdownリンクの読み取り専用影響列挙 | 原本DOM断片の移動や文書間アンカーへの影響分析 |
| AI連携 | #527 はMCPの初版を読み取り・検証に限定するDraft | 書き込みを伴う移行操作のAI/MCP公開 |

既存機能は再利用候補であり、この表をHTMLの実装証拠として扱わない。

## 3. 最小縦切りと責任分担

```text
ローカル静的HTMLのsource snapshot（読み取り専用）
  → HTML5 DOM解析（Source Adapter）
  → 明示構造の列挙（DOM node / ID / 階層 / text / 属性）
  → Candidate（種類・source locator・観測と推定を区別）
  → 選択条件とレビュー（人／外部AIの提案を同じ根拠で再検証）
  → Projection（断片ごとのHTML / Markdown / SVG / 通常画像など）
  → Applicationの保存計画・整合性検査
  → 別ファイル資産＋既存Ledger / provenanceへ接続
  → 再構成・Detachedの検査・出版
```

- **Source Adapter**: HTMLを正しく解析し、DOM・属性・テキスト・参照先を観測する。一般HTMLをXML parserや正規表現のみで解釈したことにしない。HTMLの実行・ネットワーク取得はしない。
- **Candidate / 認知**: 原本に明示された要素やIDは`observed`。見出しから推測した章境界、図と本文の意味的関係などは`inferred`。人の採用で推定が原本事実に変わるわけではない。
- **Projection**: 元の断片をHTMLとして保つ場合と、Markdown・SVGなどへ変換する場合の保証を分ける。情報落ちを黙って隠さない。
- **Application**: ファイルパス・出力衝突・source snapshot・必要資産・相互参照を確認し、保存の成否と未解決を報告する。CLI/VS Code/MCPは入口であり、意味契約の正本にしない。

この時点では新しいNotation構文、Candidate kind、ledger schema、CLIコマンド、MCP書き込みAPIを確定しない。既存契約と適合しない箇所を確認してから判断する。

## 4. HTML選択の意味を分ける

- **包含**: IDやセレクターで指定したノード自身と、その配下を対象とする。
- **除外**: 包含範囲内の`nav`、`header`、`footer`、script等を、明示条件に従い対象外にする。無関係の本文まで暗黙に除去しない。
- **列挙**: 図（`figure`、`svg`、`img`、Mermaid）や表（`table`）を探す。figure内のsvg/img等は同じ図の内包関係を示し、原則として二重の「別図」と数えない。
- **断片の境界**: 単純なノードのsubtreeと、見出しから次の同階層見出しまでの範囲は異なる。後者は自明なDOM sub-treeではないため、別の境界判断が必要。
- **HTMLからの出力**: DOMを再シリアライズした断片は通常、原本のバイト列と一致しない。原本bytes保存と構造・内容の保存は別の評価項目。

CSS selectorは選択条件の候補とするが、フルCSS selectorの採用や独自パラメータの新設を本書だけで決めない。IDが重複する、選択が0件・複数件となる、見出しの境界が曖昧な場合は自動で唯一の対象を確定しない。

## 5. 断片の同一性と鮮度

断片を取り込む際、少なくとも次の情報が追える必要がある。

| 軸 | 確認したい情報 | 混同しないこと |
| --- | --- | --- |
| 原本 | workspace内sourceのidentity / digest | 外部ページの取得時刻をsource digestと同一視しない |
| 出現位置 | ID、DOMパス、原本内の位置 | 同じ位置なら内容も同じ、とは限らない |
| 内容 | 抽出時点の断片fingerprint / 変換条件 | 同一内容の別出現を同じ採用判断にまとめない |
| 出力 | 相対パス、出力digest、参照の再配置 | 出力が生成できたことを意味的同等性としない |
| 判断 | 観測/推定、採否、レビュー時点 | AIの提案をsource factへ昇格させない |

DOMパスは構造変更で動く。IDも衝突・欠落し得るため、位置と内容fingerprintの両方を照合する。元HTMLと抽出先の両方が変更された場合、三者比較（取り込み時点／現原本／現出力）の競合を示し、黙って上書きしない。

## 6. 参照の整合性と保存

必要な検証項目は、(a) 元の内部アンカー、(b) 分割後の文書間リンク、(c) 相対パス、(d) SVG/画像・CSS等の依存資産、(e) 図表とキャプション、(f) 未解決の外部資産、(g) 出力先の衝突である。

同一HTMLの`#api`へのリンクが分割後に別ファイルへ移る場合、元のリンク文字列を残しただけでは正しくない。アンカー参照とその移行先の対応表を持ち、再構成先で確認する必要がある。ただし現行`detach-check`がHTML DOM/アンカー移行を保証しているとは主張しない。

**保存は原本read-only**とし、別のMarkdown/asset/ledgerの作成を許す。保存前にsource digest再照合、境界内の出力先確認、既存ファイル上書き拒否、不完全な資産の検出を行う。途中失敗時に生成物だけを巻き戻す方式は既存一括取り込みを参照して検討するが、複数ファイルのcrash-atomic性を無検証で保証しない。全リンクの意味的正しさ、元ページの視覚的同等性、文書の業務的真実性は別途検証対象とする。

## 7. Mermaidなどの図解

Mermaid定義テキストが原本に明示される場合は定義と配置を保持できる候補とする。描画済みSVGしかない場合はSVG図版として扱い、原定義が復元できるとは主張しない。DOM上の`figure`、caption、svgが内包関係にある場合は、図と所属情報を保持して列挙する。

JavaScriptの実行によるDOM生成や、ネットワークからの図版取得は、最初の静的HTML縦切りの対象外。出版におけるフォント、ページ幅、改ページ、SVG描画の一致は別のE2E観測とする。

## 8. AIによるマイグレーション

外部AIは元文書の目録から、分割先のファイル名・章のまとめ方・どの図表を各納品文書へ引用するかを提案できる。MMIは提案されたlocator・fingerprint・出力先を現在のsource snapshotに対して再検証する。**AIが原本にない構造を提案したことと、原本にその構造が存在することを区別する。**

AI無しでもDOMの明示構造に基づく選択・確認・抽出ができる設計を優先する。#527のMCP初版にwriteを追加したことにはしない。

## 9. 最小fixtureと確認項目

テスト材料: [静的HTML](../03_Implement/test/fixtures/html-fragment-v0/monolith.html)、[選択期待・負例](../03_Implement/test/fixtures/html-fragment-v0/expected.md)。

| ケース | 期待する観測・判断 |
| --- | --- |
| mainのみを包含 | 文書外側のheader/nav/footerを含まず、本文・図表を維持 |
| #overview選択 | 選択されたSectionの本文・リンクと、そこに含まれるfigureの所属を保持 |
| #api選択 | table、figure内のMermaid定義を別種として列挙 |
| figure全列挙 | inline SVGとMermaidの2図。内部svgやpreの二重計上なし |
| table全列挙 | endpoints表の1件 |
| 内部アンカー | #api参照は分割後の参照再配置が必要と判定 |
| source変更／ID不在／ID重複 | fingerprint再確認や明示選択を要求し、不明のまま書き込まない |
| 欠落資産／外部URL | ローカル閉包の不足や外部依存を明示し、成功と混同しない |

**実装差分（2026-10-17、Draft PR #555）**: `parse5`を直接依存として宣言し、ローカル静的HTML5のDOMから`main / section / table / figure`を観測して既存Candidate契約へ写す最小Adapterを追加した。FigureはSVG/Mermaidを含む場合だけ`diagram`、画像を含む場合に`image`とし、未知のFigureへ種類を推定しない。原本バイトDigestとCandidateのfragment fingerprintは別に確認する。明示ID選択はAdapter関数として実装したがCLIからの抽出・保存入口ではない。`mmi inspect <file.html> --json`では値全体を出さずCandidate/位置/種別を列挙する。

**未実施**: テスト実行とビルド（この作業環境にはリポジトリ依存が揃わずnpm registryへ接続できない）、CLIからのHTML断片保存、除外セレクター、HTML→Markdown投影、Ledgerへの採用、リンク書換え、複数ファイル保存の整合性、Windows/VS Code E2E、PDF品質確認。HTMLの本体実装が完了したとは扱わない。

## 10. 既存契約への受渡し

- #502（Tree）: JSON/XMLでの明示構造の扱いを参考にする。ただしHTML要素を無条件に`tree`一種へ押し込まない。
- #503（Import）: snapshot固定、ledger、rollbackを参照し、HTMLへ接続する際は追加のテストで責任範囲を証明する。
- #499（Detached）: Markdown/asset closureの基盤は参考にできる。文書群のアンカー・HTML相互参照の保証は別途。
- #515（Impact）: 出典から参照先を探す考え方を活かす。断片単位の影響調査やリンク移設を実装済みとしない。
- #527（MCP）: read-only初版の境界を維持。生成AIによるwrite操作の公開は別判断。
- #504 / ADR-0024（命名）: 文書の分解・再構成・統合を製品価値の評価軸に加えるが、上位名称や互換識別子の変更は行わない。

後続の機能開発は#553で追跡し、文書の実装状態は機械テスト、製品接続、実環境受入と分けて記録する。
