# Issue: 上位プロダクト名とMMI互換層の境界を整理する

## Meta
- Type: Docs
- Status: Draft
- Priority: Low
- Scope: product naming / README / package・CLI命名方針。実装名変更は含めない
- Expected verification level: docs-check

## Traceability
- Related ADR/Spec: ADR-0019 D1・D10、ADR-0012（MMI Notation）
- Dependency: なし

## 背景

Markdown Matrix Injectorという名称は、当初の「MatrixをMarkdownへInjectする」機能には合うが、現在の製品価値であるSource Adapter、Semantic Candidate、軽量認知、段階的モダナイズ、AI/CI利用、detachabilityまでを表しにくい。

一方、MMI Notation v1、既存CLI、VS Code拡張、文書・利用者資産を一度に改名すると互換性と認知コストが大きい。製品名、規約名、CLI名、互換レイヤー名を分離できるかを先に決める。

## Acceptance criteria

- [ ] 「MMIを上位プロダクト名として維持」「MMIをNotation / compatibility layer名として残し上位プロダクト名を新設」の少なくとも2案を比較する。
- [ ] 名前が表すべき価値を、継承、漸進、構造発見、provenance、detachability、人の作業を止めないこと、AIから扱いやすいことの観点で定義する。
- [ ] 候補名は日本語・英語での発音、CLI名の短さ、GitHub/npm等の衝突、既存プロジェクト名との混同を確認する。
- [ ] MMI Notation v1、`![[...]]`、既存ファイル・設定・diagnostic codeの後方互換性を壊さない移行案を示す。
- [ ] 改名しない場合も、READMEの一文で現在の製品価値を誤解なく説明できるか確認する。
- [ ] 決定前にpackage名、リポジトリ名、CLIコマンドを変更しない。

## Validation plan

候補ごとにREADME冒頭、`<name> inspect`、`<name> detach check`、`MMI Notation`との併記例を作り、意味の過不足と衝突を確認する。最終判断は別途ADRが必要な場合のみ起票する。

## Remaining work

- 名称検討が優先度1〜4の実装を止めないよう、実装とは独立して進める。
