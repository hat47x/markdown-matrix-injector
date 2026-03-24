# Markdown Matrix Injector Reference

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-reference](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-reference)
- Canonical source: `04_Documentation/reference.md`

## Target reader
- 記法やクエリ仕様を正確に参照したい利用者
- サポート担当者、継続利用者、開発者

## Prerequisites
- 基本的な使い方は `overview.md` または `tutorial.md` で把握していること
- 埋め込み元として CSV / XLSX / XML Spreadsheet 2003 を利用すること

## Expected result
この文書を読むと、埋め込み記法、主要パラメータ、Smart Fallback、印刷制御、入力支援機能の仕様を一覧で確認できます。

## Embed syntax
基本記法:

```text
![[<filepath>#<sheet_or_name>|<range>?<params>]]
```

主な意味:
- `filepath`: 埋め込み元ファイル
- `sheet_or_name`: シート名またはターゲット名
- `range`: A1 形式の範囲
- `params`: URL クエリ形式の追加パラメータ

## Supported data sources
- CSV
- XLSX
- XML Spreadsheet 2003

制約:
- 汎用 XML はサポート対象外で、エラー表示になります。
- パス解決は Markdown ファイルからの相対パスを優先し、必要に応じてワークスペースルートへフォールバックします。

## Query parameters
| Parameter | Purpose |
|---|---|
| `mode=card` / `mode=table` | カード表示または表表示を明示する |
| `header=first` / `header=<number>` | ヘッダ行の扱いを指定する |
| `columns=A,C,F` | 指定列だけを抽出する |
| `transpose=true` | 行列を反転する |
| `grep=<keyword>` | キーワードを含む行だけ残す |
| `highlightColumn`, `highlightValue` | 一致する行をハイライトする |
| `formatColumn=<selector>:json` | 指定列セルをコードブロック風に描画する |
| `caption=<text>` | キャプションを付与する |
| `id=<anchor>` | コンテナ ID を付与する |
| `pageBreak=before|after|both` | 印刷時の改ページ制御を付ける |
| `orientation=landscape|portrait` | 印刷向きのヒントを付ける |

## Smart Fallback
カード化が起きる代表例:
- `mode=card` を指定したとき
- 列数が 10 を超える、またはセル数が 500 を超えるとき
- シート指定なしでファイル全体を参照したとき

目的:
- 巨大表を本文へ無理に展開せず、可読性と印刷品質を守ること

## Diagnostics and input assistance
- Autocomplete は `![[` → filepath → `#` → sheet/range → `?` → parameter の順で候補を出します。
- Diagnostics は、ファイル不在・シート不在・無効 XML を検知対象とします。
- Paste / D&D は、HTML クリップボード情報や dropped files から埋め込み記法を提案します。

## Related docs
- 概要: `04_Documentation/overview.md`
- チュートリアル: `04_Documentation/tutorial.md`
- 業務シナリオ: `04_Documentation/scenario-sier-design-docs.md`
- E2E 運用: `04_Documentation/vscode-e2e-testing.md`

## Known limitations
- Reference は公開文書向けに要点を整理したものであり、将来的に FAQ / troubleshooting / sample gallery へ分割する可能性があります。
- 実機 UI の見た目確認は、manual E2E やスクリーンショット整備が別途必要です。