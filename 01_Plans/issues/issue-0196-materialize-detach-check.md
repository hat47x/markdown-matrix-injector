# Issue: 参照を実体化し、原本を外しても文書が成立するかを検査する

## Meta
- Type: Feature
- Status: Draft
- Priority: Medium
- Scope: src/cli（`render`の拡張、`detach check`）、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D2（Detached）・D3、製品要求「materialize」「detach check」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「materialize」「detach check」
- Dependency: issue-0195（取り込み台帳）。別紙カードの実体化だけは依存なしで着手できる

## 背景

`mmi render --to md`は表をGFMの表へ展開するが、別紙カードになる参照は「別紙: パス（範囲）」の1行に置き換えるだけである。原本を外すと、その情報は文書から失われる。ADR-0019は「安全にMMIを外せること」を成功条件にしている。ただし離脱は選択肢として保証するもので、人に移行を急がせない（D3・D13）。detach checkは、原本の廃止を決めた範囲に対して実行する。

## Acceptance criteria
- [ ] `render`で、別紙カードになる参照を、別ファイルの表（Markdownまたは CSV）として実体化し、本文からリンクする選択肢を設ける。既定の出力は変えない。
- [ ] `detach check`が、未展開の参照、取り込み台帳にない必須資産、壊れたリンク、原本にしか無い画像を列挙し、終了コードで結果を返す。
- [ ] 実体化した出力から原本フォルダーを取り除いた状態で、リンク切れが0件であることを確かめる手順を文書にする。
- [ ] 実体化した表には出典（ファイル、シート、範囲、ダイジェスト）を残す。

## Validation plan
実務サンプル`09-large-table.md`（別紙カードを含む）と基本設計書キットで、実体化 → 原本の削除 → `detach check`を行い、欠落0件を確かめる。

## Remaining work
- 本文の説明が古いまま残る問題（執筆ベンチマーク v0の観察）を、detach checkの範囲に含めるかは未定。業務的正しさは保証外（ADR-0019 D12）なので、警告に留めるかを決める。
