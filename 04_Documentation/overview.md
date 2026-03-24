# Markdown Matrix Injector Overview

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-overview](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-overview)
- Canonical source: `04_Documentation/overview.md`

## Target reader
- Markdown ベースの設計書・仕様書を改善したいエンジニア
- Excel / CSV / XML を正本のまま活かしたい SIer チーム
- Word 中心の巨大文書から移行先を探している導入担当者

## Prerequisites
- Markdown を日常的に編集していること
- 元データとして Excel / CSV / XML を保持していること
- 「文書に表を貼り付ける」のではなく「正本データを必要な文脈だけ見せたい」という課題を持っていること

## Expected result
この文書を読むと、Markdown Matrix Injector が解決する課題、主要機能、どのような利用者に価値があるかを短時間で説明できるようになります。

## What this tool is
Markdown Matrix Injector は、Excel / CSV / XML を **Single Source of Truth** のまま保持しつつ、Markdown 上には必要な範囲だけをインライン表示するためのツールです。

このツールが重視するのは次の 3 点です。

1. **正本を壊さないこと**
   - 元データは編集せず、ビューアとして参照に徹します。
2. **Markdown の弱点を補うこと**
   - テーブルやマトリクスが多い設計文書でも、Markdown を中心に据えたまま運用できます。
3. **納品品質まで見据えること**
   - Smart Fallback や印刷制御により、巨大表や PDF 出力時の崩れを扱いやすくします。

## Why users may care
- **設計書作成者**: 巨大な Excel をそのまま貼り直さず、必要範囲だけ埋め込めます。
- **レビュー担当者**: 正本とのズレを減らしつつ、文脈に必要な情報だけを読みやすく提示できます。
- **導入担当者**: Word 中心のドキュメント運用から、差分管理しやすい Markdown ベースへ移行しやすくなります。

## Core capabilities at a glance
- `![[...]]` 記法で CSV / XLSX / XML Spreadsheet 2003 を埋め込む
- `columns`, `transpose`, `grep`, `header` などで必要な範囲だけ切り出す
- `caption`, `id`, `pageBreak`, `orientation` で印刷や相互参照を補助する
- 巨大表やファイル全体参照は Smart Fallback でカード表示へ縮退する
- Autocomplete / Diagnostics / Paste & D&D により記法入力を支援する

## Related docs
- 最初に試す: `04_Documentation/tutorial.md`
- 業務シナリオを見る: `04_Documentation/scenario-sier-design-docs.md`
- 詳細仕様を引く: `04_Documentation/reference.md`

## Known limitations
- 本リポジトリの公開文書は Phase 6 の初回イテレーションであり、FAQ やスクリーンショット集は今後拡張予定です。
- 実機 UI の最終確認には host 環境や VSCode バージョン差の影響があります。