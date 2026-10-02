# Issue: 既存のExcel設計書の取り込み候補を示す

## Meta
- Type: Feature
- Status: In Progress（試作・単体テスト・架空データでの評価まで。2026-09-27）
- Priority: High
- Scope: `src/importAssist/`、`src/dx/importFlow.ts`、`src/core/renderTable.ts`（論理表の組立ての切り出しのみ）、検索・補完・案内付きの作成の表領域（`src/search/`、`src/dx/completionCandidates.ts`、`src/dx/authoringFlow.ts`）、`scripts/import-assist-eval/`
- Expected verification level: unit / manual-e2e

## Traceability
- Related ADR/Spec: [ADR-0019](../adr/ADR-0019-ai-era-sier-document-value-and-policy.md) D7 優先度2、[ADR-0018](../adr/ADR-0018-cognitive-assistance-plane.md)、[ADR-0017 書式補助](../adr/ADR-0017-fly-inspired-format-deviation-assistance.md)、[記法仕様](../../04_Documentation/spec/mmi-notation-v1.md) §6・§7
- Related Design: [取り込み支援](../../02_Architecture/import-assistance.md)、[認知機能の仮説カード](../cognitive-hypothesis-cards.md) K1・K2
- Dependency: なし（既存の読込み・描画を使う）

## Acceptance criteria
- [x] 方眼紙の表を、記法を変えずに表として描ける参照（`columns=`の相対列、`header=first`、必要な場合だけ`mode=table`）として提案する。
- [x] 提案は実際の描画（パーサー、Smart Fallback、論理表の組立て）で再検証し、解析で読んだ内容と一致しなければ提案しない。
- [x] 提案で表示されない値を番地付きの注意として示す。架空データの評価で、注意に載らずに消えた値を0件にする。
- [x] 表でない領域（項目と値の組、文章、見出し、記入欄、図）を役割の候補として理由付きで示す。
- [x] 同じ書式のシートをまとめ、近い書式との差を列挙する。
- [x] 下書きMarkdownは表の値を写さず、セルの文字列をMarkdownとして無害化する。
- [x] 現行の表検出との比較を、開発用データと追加ケース（1回目を修正前に記録）で行う。
- [x] VS Code宿主で、コマンド実行・下書きの保存・プレビューと同じ描画エンジンでの描画を確認する（2026-09-27、VS Code 1.134.0、Windows。`test/e2e/runImport.ts`。保存ダイアログは台本で省略）。
- [ ] 画面操作（ブックの選択、保存ダイアログ、横に開くプレビュー）を人が目視で確認する。
- [ ] 実在の（匿名化した）設計書で、候補の採用・修正・却下の割合と理由、取り込み範囲を決めるまでの時間を記録する。

## Validation plan

```sh
cd 03_Implement
node --import tsx --test test/importCandidates.test.ts
npm run eval:import-assist
npm run eval:import-assist -- --set holdout
```

拡張機能ホスト（インストール済みのVS Codeを使う場合は`VSCODE_EXECUTABLE_PATH`を指定。ユーザーデータと拡張は一時フォルダに分ける）:

```sh
npm run build
node --import tsx ./test/e2e/runImport.ts
```

架空データの3ブックで取り込みコマンドを実行し、下書きを`markdown.api.render`（プレビューと同じエンジン）で描画して、表・カード・エラーの数、診断、原本のハッシュを確かめる。`npm run build`は研究層の既存の型エラーで終了コードが0にならないが、出力は生成される。

目視: 同じデータをワークスペースに置き、`MMI: Import Tables from Workbook`を実行する。下書きのプレビューで、方眼紙の表が表として描かれ、注意が表示されることを確かめる。

## Remaining work

**2026-09-27の結果**（詳細は[設計§6](../../02_Architecture/import-assistance.md#6-評価)）:

- 正本どおりに描けた表: 現行3/12 → 試作12/12（開発用）。追加ケースは現行0/9、試作1回目3/9、一般規則の修正後9/9（盲検ではない）。
- 表でない領域の役割: 開発用43/43、追加ケース1回目1/5、修正後5/5。消えた値は全回0件。
- 単体テスト18件を追加。Linux（`git archive`で取得した`HEAD`）でも、変更前後で失敗の集合は同じ（研究層の既存失敗26件）。Windowsでも同じ（パス・シンボリックリンク・改行に起因する既存失敗49件）。
- VS Code 1.134.0の拡張機能ホストで、3ブックの下書きの参照14件がすべて表として描画された（カード0、エラー0、診断0、原本のハッシュ不変）。2回実行して同じ結果。
- 説明からの検索・補完・案内付きの作成を方眼紙に対応させた（[設計§6.6](../../02_Architecture/import-assistance.md#66-説明からの検索補完案内付きの作成)）。方眼紙の架空データで検索の1位が期待どおりの表になった依頼は2/7→5/7、候補5件内は2/7→6/7。issue-0115の評価は変更前と同値。案内付きの作成は拡張機能ホストで確認した。

残り:

- 画面操作の目視確認。
- 別の作り手による未見の架空データでの1回評価と、実在の設計書での観測（ADR-0019 D9・D10の指標4）。
- 「受注照会のイベント」のように、表題と同じ列名がある依頼の読み方（issue-0115で扱う）。
- ~~CLI `inspect`の表候補として出力する（ADR-0019 優先度1と合わせる）。~~ **2026-10-02:** `mmi inspect --import-assist` として接続。Semantic Candidate本体とは分離し、既存解析のrole/reason、通常rendererで再検証済みの参照案、cautionだけを投影する。セル値/excerptはこの投影へ複製しない。
- 記法仕様§6の`columns=`の列文字（範囲内の相対列）の明確化。仕様の判断として扱う。

## Bulk-import integration（2026-10-02）

issue-0200の共通materializerから本Issueの解析・下書き生成を再利用し、既存のVS Code取り込みコマンドとCLI `mmi import` を同じ製品経路へ揃えた。本Issueは引き続き、表・key-value・prose・form・diagram等の**候補の質と人の判断支援**を担当する。一方、画像assetの抽出、取り込み台帳、一括materializeの書き込み境界はissue-0200が担当する。

これにより、取り込み支援のroleを権威的事実へ昇格させずに、表は追従参照、埋込画像は通常asset、その他はレビュー候補として1つの下書きにまとめられる。残る受入条件は従来どおり、画面操作の目視確認と実在設計書での採用・修正・却下の観測である。

## Product integration checkpoint（2026-10-02）

既存のVS Code試作をCLI/AI入口へ再利用するため、`mmi inspect --import-assist` を追加した。通常の `inspect` は従来どおりAuthority寄りのSemantic Candidateを返し、明示opt-in時だけ `importAssistance` を併記する。これにより、方眼紙向けヒューリスティックのroleをobserved事実へ昇格させない。

投影するのは `sheet / role / range / reasons / revalidated proposal / caution code+cells` に限定した。元セル値やexcerptを複製しないため、AI/CLI利用時にも「候補を見つけるために設計書本文をもう一度コピーする」経路を増やさない。proposalは既存 `analyzeSheetForImport` が通常のparser → Smart Fallback → logical table rendererで再検証できた場合だけ出る。

この接続により、VS Code UIを開かないAIエージェントやCLI利用者も、既存設計書について「どこを表として参照できるか」「どこがkey-value/prose/form/diagram候補か」「何を確認すべきか」を一度のinspectから取得できる。実在設計書での採用・修正・却下率と目視UI確認は引き続き実機/利用者観測として残す。
