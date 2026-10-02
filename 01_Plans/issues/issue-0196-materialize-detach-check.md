# Issue: 参照を実体化し、原本を外しても文書が成立するかを検査する

## Meta
- Type: Feature
- Status: In Progress（表・別紙カードのmaterializeとartifact closureのdetach-checkを実装。認知資産・原本内画像の網羅監査は未実装）
- Priority: Medium
- Scope: src/application（materialize / detach check）、src/cli、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D2（Detached）・D3、ADR-0021、製品要求「materialize」「detach check」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「materialize」「detach check」
- Dependency: issue-0195（取り込み台帳）。表のmaterialize自体は台帳に依存しない

## 背景

`mmi render --to md`は小さな表をGFM表へ展開できるが、Smart Fallbackで別紙カードになる参照は従来「別紙: パス」の1行へ置き換えるだけであり、原本を外すと情報が欠けた。ADR-0019は「安全にMMIを外せること」を成功条件にしている。ただし離脱は選択肢として保証するもので、人に移行を急がせない（D3・D13）。

Detachedは「MMI記法が無い」だけでは不十分である。materialize後の成果物が通常のMarkdownとローカル添付だけで閉じ、未実体化の別紙や壊れたリンクを機械的に検出できる必要がある。

## Acceptance criteria
- [x] 通常の`render`の既定挙動を変えず、`mmi materialize <doc.md> -o <detached.md>`を追加する。
- [x] 通常表は本文へGFMとして実体化し、Smart Fallbackでカード相当になる表は、明示sheetがあり安全な上限内なら独立Markdown表へ実体化して本文から通常リンクする。
- [x] materializeした別紙にはsource相対パス、sheet/range、source digestのprovenanceを残す。
- [x] sheetを特定できない参照やhard limit超過等は黙って欠落させず、`mmi:unmaterialized` markerと診断を残してexit 1にする。
- [x] `mmi detach-check <doc.md>`が、残存MMI参照、未実体化marker、旧`別紙:`カード、壊れたローカルリンク、workspace外へ出るローカルリンクを列挙し、終了コードで結果を返す。
- [x] GFM表投影をCore側（`src/core/markdownTable.ts`）へ共有し、通常renderとmaterializeが同じ変換を使う。
- [ ] import ledgerを使い、原本にしか存在しない「この文書に必要な」画像・その他Candidateをdetach監査へ接続する。単にブック内の全画像を必須とみなさず、文書との採用関係を使う。
- [ ] 実体化した成果物から原本フォルダーを取り除いた状態で、実務サンプルと基本設計書キットを使ったE2Eを実行・記録する。
- [ ] CLI build / unit testを実行し、新規`detach.test.ts`を含む回帰を確認する。

## 実装（2026-10-02）

- `src/application/materialize.ts`: 通常表をinline化し、カード相当の表を`mmi-materialized/table-<digest>.md`へ外出しするApplication Service。attachment名はsource digest・sheet/range・parameterから決定論的に作る。
- `src/application/detachCheck.ts`: artifact closureを検査するApplication Service。コードフェンス内の例示は無視し、MMI依存と壊れた通常リンクを可視化する。
- `src/core/markdownTable.ts`: GFM表投影を通常renderとDetachedで共有。
- CLI: `materialize` / `detach-check`。出力先は`--root`内に限定し、既存attachmentと内容が違う場合は上書きしない。
- `test/detach.test.ts`: 別紙相当の外出し、小表inline化、安全にmaterializeできない参照、closure検査のfixtureを追加。

## Validation plan

1. unit fixtureで、小表→inline、大表→別Markdown、sheet未指定→unmaterialized、壊れたリンク→detach errorを確認する。
2. 実務サンプル`09-large-table.md`をmaterializeし、生成先だけを別ディレクトリへコピーして原本を除去する。
3. その生成先に対して`mmi detach-check`を実行し、0 errorを確認する。
4. 基本設計書キットでも同じ手順を実行する。
5. sourceの画像Candidateについて、ledgerのreview/import関係から「detachに必要だが未実体化」を判定する設計を追加する。

## Remaining work

- **画像の完全性:** 「ブックに画像がある」だけでdetach blockerにはしない。文書で採用した画像・Candidateとの関係を台帳/UIから得て監査する必要がある。
- **本文の業務的鮮度:** 本文の説明が正本と矛盾していないかはAuthority保証外。detached成果物に対するoptional review warningとして扱う余地はあるが、detach可否の必須判定にはしない。
- **非表Candidate:** Tree / Shape / Diagram等がextract/materialize可能になった時点で同じclosure checkへ追加する。
