# Issue: 参照を実体化し、原本を外しても文書が成立するかを検査する

## Meta
- Type: Feature
- Status: In Progress（表・別紙・ローカル画像のmaterialize、採用済みExtracted Candidateの鮮度preflight、artifact closure checkを実装。表・キットの実務E2Eは実施済み。画像manual-E2Eと正本suite実行待ち）
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
- [x] 文書中の`mmi:extracted` / `mmi:extracted-table` provenanceを「この文書への採用関係」として使い、import ledgerと現在のsource Candidateを照合する。changed / stale / missing / untrackedはmaterializeのdetachability判定を失敗させる。ブック内に存在するだけの未採用Candidateはblockerにしない。
- [x] 通常Markdownのローカル画像参照をcontent digest名で`mmi-assets/`へ複製し、Detached文書のリンクを成果物側へrebaseする。同じbytesは1コピーにまとめ、欠落・workspace境界外はfail-closedにする。
- [x] 実体化した成果物から原本フォルダーを取り除いた状態で、実務サンプルと基本設計書キットを使ったE2Eを実行・記録する（2026-10-06。成功ケースとfail-closedケースを下表へ記録）。
- [ ] CLI build / unit testを実行し、新規`detach.test.ts`を含む回帰を確認する。

## 実装（2026-10-02）

- `src/application/materialize.ts`: 通常表をinline化し、カード相当の表を`mmi-materialized/table-<digest>.md`へ外出しするApplication Service。attachment名はsource digest・sheet/range・parameterから決定論的に作る。
- `src/application/detachCheck.ts`: artifact closureを検査するApplication Service。コードフェンス内の例示は無視し、MMI依存と壊れた通常リンクを可視化する。
- `src/application/detachFreshness.ts`: 文書へ採用済みのExtracted表・画像をprovenanceから抽出し、現在sourceのCandidateと`mmi-ledger.json`を照合するpreflight。review basisが変わった資産を古いままDetachedへ固定しない。
- `src/application/materialize.ts`: ローカルMarkdown画像を`mmi-assets/<sha256-prefix>.<ext>`へcontent-addressed copyし、出力文書の相対リンクを成果物側へrebaseする。
- `src/core/markdownTable.ts`: GFM表投影を通常renderとDetachedで共有。
- CLI: `materialize` / `detach-check`。出力先は`--root`内に限定し、既存attachmentと内容が違う場合は上書きしない。
- `test/detach.test.ts`: 別紙相当の外出し、小表inline化、安全にmaterializeできない参照、closure検査のfixtureを追加。

## 実務E2Eの実測（2026-10-06）

最新の`main`（`6fba0dd`）で、実務サンプルとキットを`materialize`し、出力フォルダーだけを別の場所へコピー（原本なし）して`detach-check`を実行した（Linux、Node 20.20.2、CLIは開発ツリーから実行）。

| 文書 | materialize | 原本なしのdetach-check |
| --- | --- | --- |
| 09-large-table（別紙カード、60件×11列） | 成功（別紙の表1件） | 指摘0件 |
| 02-requirements | 成功 | 指摘0件 |
| 08-release | 失敗（exit 1）。`mode=card`でsheetの指定が無い参照を「sheetを選んでから切り離す」と診断し、`mmi:unmaterialized`を残す | 未実体化の参照が残るため指摘2件 |
| 基本設計書キット | 成功 | 1件。本文が`masters/基本設計.xlsx`へ通常リンクしており、原本を外すと壊れる（`MMI_DETACH_BROKEN_LINK`） |

- 失敗と指摘は、どれも黙って欠落させず理由を示す設計どおりの動きである。08-releaseはsheetを明示すれば実体化できる。キットの1件は、本文の説明にある原本へのリンクを、原本を廃止する範囲ではリンクでなく文字に書き換える必要がある。
- 受入条件のE2E（上記の表）は実施した。**画像を含む文書でのE2E**（`extract`で取り込んだ画像を`mmi-assets/`へ複製して原本を外す）は未実施。
- Windows・macOSでは未実施。

## 画像Detached縦通し回帰（2026-10-08）

`test/detach.test.ts`へ、Excel埋込画像を実際の採用ライフサイクルへ通す統合回帰を追加した。架空XLSXから`extractImages`で画像を取り込み、`mmi-ledger.json`へreview basisを記録し、文書へ`mmi:extracted` provenanceを置く。その状態でfreshness preflightを通し、`materializeDocument`が画像をcontent-addressedな`mmi-assets/`へ複製することを確認する。Detached文書と複製assetを書いた後は、元workbook、取り込み時のasset directory、ledgerを削除し、`detach-check`がsource-independentな成果物だけで0 errorになることを契約にした。

同じfixtureで、workbook内の無関係なメモだけを変更した場合は画像のClaim-level review basisをstaleにしない一方、採用した画像bytesを変更した場合は`MMI_DETACH_EXTRACTED_STALE / ledgerState=changed`で止める回帰も追加した。whole-workbook digestの変化だけで局所的な採用判断を無効化せず、実際の採用対象変更はdetachment前に止める境界を確認する。

さらに利用者経路として、`mmi extract --image` → `mmi materialize` → 元workbook・元asset・ledger削除 → `mmi detach-check`をCLI経由で通す回帰を追加した。source画像変更後の`mmi materialize`はexit 1、`written=false`となりDetached出力を作らないことも固定する。

これらは正本テストコードとして追加したが、このチャットの実行環境にはリポジトリcheckoutと依存一式がないため、ここではsuite実行済みとは扱わない。画像を含む実際の設計書でのmanual-E2Eも別途残す。

## Validation plan

1. unit fixtureで、小表→inline、大表→別Markdown、sheet未指定→unmaterialized、壊れたリンク→detach errorを確認する。
2. 実務サンプル`09-large-table.md`をmaterializeし、生成先だけを別ディレクトリへコピーして原本を除去する。
3. その生成先に対して`mmi detach-check`を実行し、0 errorを確認する。
4. 基本設計書キットでも同じ手順を実行する。
5. provenance付きで採用した画像/表をsource変更後にmaterializeし、changed/staleでexit 1になることを確認する。
6. 原本フォルダーと元の画像フォルダーを削除した後、Detached側の`mmi-assets/`だけで`detach-check`が0 errorになることを確認する。

## Remaining work

- **画像の完全性:** 自動回帰ではextract→ledger freshness→materialize→原本/元asset除去→detach-checkまで固定した。次は画像を含む実在設計書で同じ操作をmanual-E2Eし、自動fixtureだけでは見えないパス・画像形式・運用上の問題を観測する。「ブックに画像がある」だけではdetach blockerにせず、本文中のMMI provenanceを採用関係の正本とする境界は維持する。
- **本文の業務的鮮度:** 本文の説明が正本と矛盾していないかはAuthority保証外。detached成果物に対するoptional review warningとして扱う余地はあるが、detach可否の必須判定にはしない。
- **非表Candidate:** Tree / Shape / Diagram等がextract/materialize可能になった時点で同じclosure checkへ追加する。
