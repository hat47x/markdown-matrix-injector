# Issue: 参照を実体化し、原本を外しても文書が成立するかを検査する

## Meta
- Type: Feature
- Status: In Progress（表・別紙・ローカル画像のmaterialize、採用済みExtracted Candidateの鮮度preflight、artifact closure checkを実装。表・キット・画像つき文書の実務E2Eは実施済み（2026-10-08）。Windows・macOSの実行確認が残り）
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
- [x] CLI build / unit testを実行し、新規`detach.test.ts`を含む回帰を確認する（2026-10-08、origin/main `06ab712`、Node 20）。`detach.test.ts`・`detachFreshness.test.ts`・`yamlTreeDetachFreshness.test.ts`は全て通過。`importMaterialization.test.ts`は56件中3件が失敗（一括取り込みの画像の判断。下記の内訳）。

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

## 画像つき文書の手動E2E（2026-10-08）

実在の設計書ではなく架空のワークブック（表1枚、画像3か所、うち1件は同一内容の重複）で、利用者の流れを`dist`のCLIから順に実行した。再実行できる手順は`03_Implement/scripts/manual-e2e/image-detach.sh`に置いた。

| 手順 | 結果 |
| --- | --- |
| `mmi extract --image all` → 台帳`mmi-ledger.json`と`assets/` | 成功。画像3か所を抽出（同一内容は1ファイル、provenance付きの参照を出力） |
| `mmi materialize`（表を実体化し、画像を`mmi-assets/`へ複製） | 成功。表はGFM、画像は`mmi-assets/`の2ファイル（重複を1つにまとめた） |
| 元ワークブック・`assets/`・台帳を削除し、出力フォルダーだけを別の場所へ移す | — |
| `mmi detach-check`（出力フォルダーだけで） | 成功（指摘0件） |
| 負のケース: レビュー後に画像をExcelで差し替えた | `materialize`は終了コード1（`MMI_DETACH_EXTRACTED_STALE`、「採用したCandidateが変わっている」）。出力は作られない |

**環境の注意（再現時に必要）。** 非ログインのWSLシェルは`/usr/bin/node`（Node 18）を選び、CLIが`SyntaxError`で落ちる（[0197](issue-0197-cli-distribution.md)と同じ問題）。Node 20を`PATH`の先頭に置くか、`NODE_BIN`で指定する。tsxでTypeScriptを起動すると`/mnt/c`上では1回あたり数分かかったため、`npm run build:product`で作る`dist`を使う。最初の試行はこれらが原因で無効になったため、結果には含めない。

**まだ確認していないこと。** 実在する設計書（形式・パス・画像の数が多い文書）での操作、Windows・macOSでの実行、図形（Shape）の取り込みを伴う文書。

## origin/main全体テストの内訳（2026-10-08、`06ab712`、Node 20）

1931件中45件が失敗した。内訳は次のとおり（本Issueの回帰は含まない）。

- **研究層の既知の失敗（37件）:** フィル・SAI・Jev・凍結済みブロブ等。以前から失敗していたもの。
- **Candidate生成の共通化リファクタの途中で、テストと実装が食い違っている製品テスト（8件程度）:** 例として、`CLI inspect`と`VS Code review inventory`の画像Candidateの一致（`application.tableRegions`が欠落）、一括取り込みで画像を拒否・保留した判断の保存（`importMaterialization`の3件）、JSON/YAML/XMLのTree変換、`extensionIntegration`のコマンド一覧、`cognitiveArtifactCli`（バイナリ出力をJSONとして読む）。2026-10-07以降のコミット（`dc83af3`〜`761b5fc`）に由来すると見られる。このIssueの範囲外で、各担当の作業に任せる。

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

- **画像の完全性:** 自動回帰に加え、画像つき文書の手動E2E（2026-10-08、架空のブック）を実施し、再実行手順を`scripts/manual-e2e/`に置いた。残りは実在する設計書での同じ操作（パス・画像形式・件数の多さによる運用上の問題を観測する）。「ブックに画像がある」だけではdetach blockerにせず、本文中のMMI provenanceを採用関係の正本とする境界は維持する。
- **本文の業務的鮮度:** 本文の説明が正本と矛盾していないかはAuthority保証外。detached成果物に対するoptional review warningとして扱う余地はあるが、detach可否の必須判定にはしない。
- **非表Candidate:** Tree / Shape / Diagram等がextract/materialize可能になった時点で同じclosure checkへ追加する。
