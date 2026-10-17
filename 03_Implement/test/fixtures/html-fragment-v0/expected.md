# HTML断片の選択・分解に関する期待一覧（未実装・レビュー用）

- 対象: [monolith.html](monolith.html)
- 対応: [設計境界 v0](../../../../02_Architecture/html-fragment-decomposition-v0.md)、[Issue #553](https://github.com/hat47x/markdown-matrix-injector/issues/553)
- 状態: **fixture＋期待記述のみ**。このファイル自体は実行済みテストの証拠ではない。

## 原本の構造（静的HTMLの観測）

| 要素 | DOMの位置・識別 | 期待する意味 |
| --- | --- | --- |
| `header` | `#site-header`（main外） | `#spec`を選択すると取り込まない |
| `nav` | header内 | `#spec`には含まれない |
| `main` | `#spec` | 本文の包含範囲 |
| `section` | `#overview`、`#api` | HTMLに明示された2節 |
| `figure` | `#architecture` | inline SVGとfigcaptionで一つの図 |
| `table` | `#endpoints` | caption＋thead＋tbody、2データ行の表 |
| `figure` | `#sequence` | Mermaid定義のpre＋figcaptionで一つの図 |
| `footer` | `#site-footer`（main外） | `#spec`を選択すると取り込まない |

## 正例

1. **`#spec`の選択**: `#overview`と`#api`を含み、main外のheader/nav/footerは含まない。原HTML bytesは変えない。
2. **`#overview`の選択**: 見出し、段落、`#api`への内部アンカーリンク、`#architecture`のSVGとfigcaptionが残る。
3. **`#api`の選択**: エンドポイント表、Mermaid定義、図のキャプションが残る。`sequenceDiagram`という文字列からの推測に限定せず、`pre.mermaid`を原本のDOM要素として観測する。
4. **全図の列挙**: `#architecture`と`#sequence`の2件。`figure`内のSVGとpreを無条件に別図として数えない。
5. **全表の列挙**: `#endpoints`の1件。データ2行、見出し1行、captionがある。
6. **節の分割保存**: `#overview`と`#api`をそれぞれ独立ファイルとして扱う場合、元`#api`アンカーへのリンク移設が必要な事実を記録する。移行先名や新しいNotation構文は未決。
7. **原本と出力の同一性**: `source digest`、選択断片のfingerprint、出力digestを別々に記録する。同じ内容の複数出現があってもlocatorは別にする。
8. **外部参照**: `https://example.invalid/external`はHTMLに明示されたリンクとして確認するが、取り込み時に自動アクセスしない。外部参照であることを扱い、ローカル閉包の保証とは区別する。

## 負例と境界

| 変化・入力 | 期待する判断 |
| --- | --- |
| `id="api"`を削除 | `#api`選択を成功扱いしない |
| `id="api"`を別節にも付与 | 重複を黙って片方へ決定しない |
| レビュー後にSection本文を変更 | 古いfingerprintでの保存を確定しない |
| 相対画像の参照先が存在しない | 不足を明示する。リンク文字列があるだけでDetached成功としない |
| 出力先に別内容のファイルが存在 | 上書きせず中断する |
| 出力先がworkspace外／symlinkで外へ抜ける | 原本・出力の境界を満たさないとして拒否する |
| `script`実行が必要な図表 | 最初の静的HTML対応では動的図表を取得済みとしない |
| `figure`内に複数の独立図がある | 二重計上防止の規則と本当の複数図の判断を分けて報告する |
| CSS依存の視覚情報 | DOMから値を保存しただけで視覚的再現を保証しない |
| 見出しからの節境界推定 | DOMに明示された節の`observed`とは分けて`inferred`を維持する |

## 実装時のテスト追加項目

上記の期待値を機械化する際には、HTML5パーサで解釈したDOMの観測、Candidateの認識論、保存時のsource snapshot、Ledgerとprovenance、リンク再配置、原本への非書込、部分失敗時の生成物回収を別のテストで確認する。

このfixtureには生のMermaid定義を含むが、**Mermaidによる図の描画結果やPDF出力が確認済みという意味ではない**。図の描画品質と出版品質は将来のE2Eで確認する。
