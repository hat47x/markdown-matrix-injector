# Issue: 参照を実体化し、原本を外しても文書が成立するかを検査する

## Meta
- Type: Feature
- Status: In Progress（別紙カードの実体化とdetach-checkは実装・実サンプルで検証済み。画像・台帳との横断と、本文の説明の古さの扱いが残り）
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

## 結果（2026-10-02）
- 実装: `src/cli/materialize.ts`（CSV実体化と`mmi.materialized/v1`のmanifest）、`src/cli/detach.ts`（`mmi detach-check`）、`mmi render --to md -o <出力> --materialize <dir>`。`--materialize`を付けない`render`の出力は変えていない。テストは`test/detachCheck.test.ts`（13件）。独立レビューで再現された問題（参照形式・HTMLリンクの見逃し、`file:`・ドライブ文字・シンボリックリンク経由の境界越え、`p(1).csv`や`..dots.csv`の誤検出、15万行を超える表での失敗、失敗時の孤立CSV）は修正して回帰テストにした。
- 実体化したCSVは、参照が表すlogical table（仕様§6）そのもので、名前は参照の`id`または原本名と内容のダイジェストから決まる。同じ内容は1ファイルになり、再実行は何も変えない。
- 実サンプルでの確認: 実務サンプル`09-large-table.md`と`08-release.md`を実体化し、出力フォルダーだけで`detach-check`が指摘0件。基本設計書キットは、本文の説明が`masters/基本設計.xlsx`へリンクしているため、原本を外すと壊れるリンクとして正しく指摘された。実体化しない`render`の出力は`DETACH_UNMATERIALIZED_ATTACHMENT`で指摘される。
- 指摘コード: `DETACH_UNEXPANDED_REFERENCE`、`DETACH_UNMATERIALIZED_ATTACHMENT`、`DETACH_BROKEN_LINK`、`DETACH_LINK_OUTSIDE_ROOT`、`DETACH_OUTPUT_MISSING`、`DETACH_OUTPUT_CHANGED`。

## Remaining work
- 画像を含む文書でのdetach checkの実機確認（`extract`で取り出した画像を含む文書。台帳の出力欠落は検査済みだが、画像の実体を含む通しの確認はしていない）。
- 実体化したCSVを、Markdownの表やPDFに見える形で本文へ取り込む選択肢（現在は別紙としてリンクする）。
- 「原本にしか無い画像」の検出は、本文が原本へ直接リンクしている場合だけ`DETACH_LINK_OUTSIDE_ROOT`で捉えられる。台帳にない画像を、本文のどこから参照しているかを辿る検査は未実装。
- 本文の説明が古いまま残る問題（執筆ベンチマーク v0の観察）を、detach checkの範囲に含めるかは未定。業務的正しさは保証外（ADR-0019 D12）なので、警告に留めるかを決める。
