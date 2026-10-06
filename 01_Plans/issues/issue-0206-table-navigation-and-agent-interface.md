# Issue: Excelを開かずに表・列・行を特定・選択する入口（人とAI）

## Meta
- Type: Feature
- Status: In Progress（試作・単体テスト・拡張機能ホストでの確認まで。2026-09-27）
- Priority: High
- Scope: `src/importAssist/workbookStructure.ts`、`src/navigate/`、`src/core/evaluateEmbed.ts`（プレビューと共有する評価の切り出し）、`src/cli/mmi.ts`、`src/dx/tableCatalogView.ts`、`04_Documentation/ai-agent-guide.md`
- Expected verification level: unit / integration / manual-e2e

## Traceability
- Related ADR/Spec: [ADR-0019](../adr/ADR-0019-ai-era-sier-document-value-and-policy.md)（経路A・Bと優先度1のCLI）、[ADR-0022](../adr/ADR-0022-semantic-selection-in-notation.md)（記法での扱い、Proposed）、[ADR-0018](../adr/ADR-0018-cognitive-assistance-plane.md)
- Related Design: [表の走査と選択](../../02_Architecture/table-navigation.md)、[取り込み支援](../../02_Architecture/import-assistance.md)
- Dependency: [issue-0205](issue-0205-import-assistance-prototype.md)（表の候補）

## Acceptance criteria
- [x] 名前付き範囲、Excelテーブル、シートの表示状態、非表示の行・列、オートフィルターを、Excelで作ったブック（.xlsx・.xlsb・.xls）から読む。読めないもの（.xlsb/.xlsのテーブル）は「取得できなかった情報」として示す。
- [x] Excelテーブルは推定より優先して表の候補にする。集計行は範囲から外して示す。非表示の行・列が範囲にあれば注意を出す。
- [x] 目録（ブック→シート→表→列）を返す。既定では構造だけを返し、セルの値は明示したときだけ返す。
- [x] 表を名前・表題・範囲で、列を見出し名で、行を文字列（列の指定可）か件数で選び、描画で確かめた参照を返す。記法で正確に表せない絞り込みは、件数付きで知らせる。
- [x] CLI（`inspect`・`select`・`find`・`check`・`render`）を、JSON出力と終了コード付きで提供する。`check`はProblemsパネルと同じ診断コードに、描画時の失敗を加える。
- [x] プレビューとCLIが、参照1件の評価で同じ経路を使う（`evaluateEmbed`）。
- [x] VS Codeのエクスプローラーに表の目録を出し、表から「参照を挿入」「列と行を選んで挿入」を、確認の段を通して行える。
- [ ] 画面操作（目録の表示、ボタン、QuickPick）を人が目視で確認する。
- [ ] AIエージェントが手引きと`mmi`だけで、参照付きの章を完成させ、`check`のエラーを0件にできることを実環境で確かめる（ADR-0019優先度1の到達の目安）。

## Validation plan

```sh
cd 03_Implement
node --import tsx --test test/workbookStructure.test.ts test/navigate.test.ts
npm run mmi -- inspect test/fixtures/excel-authored/features-excel2016.xlsx
npm run build
node --import tsx ./test/e2e/runImport.ts   # VSCODE_EXECUTABLE_PATH で既存のVS Codeを使える
```

## Remaining work

**2026-09-27の結果:**

- Excel 2016で作ったブックで、名前（範囲・セル・行・列・シート単位・動的・定数・`#REF!`）、テーブル（集計行1）、非表示の行・列、フィルター、非常に非表示のシートを読んだ。.xlsbも同じ結果（テーブルを除く）。
- 公開されたファイル形式に沿って組んだ部品で、スピルの値とセル内チェックボックス（`TRUE`/`FALSE`）を読めることを確かめた。Excel 365で作ったファイルでの確認は未実施。
- 単体テスト9件を追加（構造4、目録・選択・CLI 5）。
- VS Code 1.134.0の拡張機能ホストで、目録の木（表・列・シート上の列）と、目録から見出しで列を、文字列で行を選んで挿入する流れを確認した（確認の段は「本体5行 × 2列（見出しあり）」）。

**2026-10-03:** `mmi select --candidate <fingerprint>`で`inspect --json`の表Candidateを直接選べる。`select`と`find`のJSONに同じCandidate指紋を載せ、台帳・レビューと同じ識別で追える（結合のあるシートの表Candidateは論理列で認識）。指紋が変わっていれば理由を示して止める。

**2026-10-06:** ADR-0022の選択肢B（`x-headers`）を拡張した。案内付き作成が新しい参照へ`x-headers`を記録し、警告`MMI_HEADERS_MISMATCH`に「現在の表に更新する」修正候補を出す。実VS Code・実Excelのブックで確認した（詳細はADR）。

残りは次のとおりです。

- 画面操作の目視確認と、AIエージェントでの実環境の確認。
- セル内画像が空欄になることの検出。Microsoft 365で作ったファイルでの確認。
- 補完・検索・取り込み・目録の対象に.xlsm・.xlsbを加えるかの判断。
- [ADR-0022](../adr/ADR-0022-semantic-selection-in-notation.md)の採否（見出し・名前・テーブルの記法での扱い、列を指定した行の選択、非表示の扱い）。
- CLIの配布形態（ADR-0019の未解決事項）。
