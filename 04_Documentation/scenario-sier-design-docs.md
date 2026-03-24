# Scenario Guide: SIer Design Documents

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-scenario-sier-design-docs](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-scenario-sier-design-docs)
- Canonical source: `04_Documentation/scenario-sier-design-docs.md`

## Target reader
- SIer の設計書・納品文書を作成する担当者
- Word / Excel 中心の設計書から Markdown ベースへ移行したいチーム

## Prerequisites
- 設計項目の正本として Excel / CSV / XML を維持していること
- Markdown をレビューや差分管理に使いたいという合意があること
- 「巨大表をすべて本文に展開しない」運用を受け入れられること

## Expected result
この文書を読むと、Markdown Matrix Injector を SIer 文書運用にどう当てはめるか、どの機能がどの課題に効くかを具体的にイメージできます。

## Scenario 1: 設計書本文は Markdown、一覧正本は Excel
課題:
- 設計書本文は Markdown で差分管理したい。
- ただし、権限定義表や状態遷移表の正本は Excel のまま維持したい。

使い方:
- 設計書本文に必要な範囲だけ `![[...]]` で差し込む。
- レビュー対象の章では `grep`, `columns`, `header` を使って必要な断面だけを見せる。

価値:
- 本文は軽量なまま保てる。
- Excel 正本と本文の二重更新を減らせる。

## Scenario 2: 巨大表は別紙参照として扱う
課題:
- 数十列・数百セルの一覧は本文に展開すると読みにくく、印刷でも崩れやすい。

使い方:
- `mode=card` を明示する、または Smart Fallback に任せてカード表示へ縮退する。
- 印刷時は別紙参照ブロックとして扱い、本文側では要点だけを説明する。

価値:
- 本文の可読性を保ちながら、正本ファイルへの導線を残せる。
- 納品時の PDF 崩れやレビュー時の視線負荷を減らせる。

## Scenario 3: 監査・レビュー向けに必要箇所だけ抜き出す
課題:
- 監査やレビューでは、巨大な一覧の全件より「特定条件に一致する断面」だけを見たいことが多い。

使い方:
- `grep`, `columns`, `highlightColumn`, `highlightValue`, `formatColumn` を組み合わせる。
- JSON や設定値が入った列はコードブロック風に描画し、対象行だけをハイライトする。

価値:
- レビュー観点に合わせた断面を、そのまま Markdown 文脈内へ差し込める。
- レビュアーが元 Excel の全体を毎回開かなくてもよくなる。

## Related docs
- プロダクト概要: `04_Documentation/overview.md`
- 最初に試す手順: `04_Documentation/tutorial.md`
- 詳細パラメータ一覧: `04_Documentation/reference.md`

## Known limitations
- Smart Fallback の最終見え方や印刷時レイアウトは、利用するレンダラや CSS と組み合わせて調整が必要です。
- 公開文書では一般的なシナリオに絞っており、組織固有テンプレートや社内ルールへの適用は別途設計が必要です。