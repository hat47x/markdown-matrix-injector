# 実機確認の棚卸し（提示層だけを人に残す）

MMI固有のmanual確認は、人の目でしか分からない**提示層**だけに残す。この文書は、`vscode-e2e-testing.md`のChecklist A〜Fを、次の4列へ割り当てる。

- **CLI**: 実機の前にヘッドレスで確かめられるコマンド・純関数。
- **自動E2E**: 実装済みのレーン（`test:e2e` / `test:e2e:coauthoring` / `test:e2e:import` / `test:e2e:practical`）。
- **人の実機**: 提示層として人に残す項目。
- **Checklist**: `vscode-e2e-testing.md`の該当節。

> この表は2026-10-21時点の割り当てであり、`test:e2e:*`の実測結果ではない。実機が無い環境で作成したため、自動E2E欄は「実装済みの経路」を示す。次回の実機確認で、`test:e2e:*`を実行して欄を実測で埋める。

## 1. 割り当て表

| 確認したいこと | CLI | 自動E2E（レーン） | 人の実機 | Checklist |
| --- | --- | --- | --- | --- |
| 参照の解決、表・カード・エラーのHTML契約 | `mmi render <doc.md> --to html`、`mmi check --json` | `test:e2e`（`markdown-preview-entry`、`render-command`） | Previewの見た目・CSS崩れ | A / F |
| 診断コード、対象行、メッセージ | `mmi check --json`、`createDiagnosticsForDocument`の単体テスト | `test:e2e`（`diagnostics`） | Problemsパネルの配置・行ジャンプ・クリック遷移 | B |
| 補完候補（filepath / sheet / query） | `mmi select` / `mmi find` / `mmi inspect --json` | `test:e2e`（`autocomplete-boundary`）※known unstable | 候補の表示位置・選択・挿入結果 | C |
| `x-below`の記録と現在の一致（静か・警告・情報） | ヘッドレス単体テスト（`xBelow`） | `test:e2e:coauthoring`（Windows＋Excel） | なし（記録と診断はCLI/E2Eで見る） | D/Eの前提 |
| 取り込みが作る参照テキスト（`&x-below=0`） | `mmi import` / `mmi extract --json` | `test:e2e:import` | なし | — |
| PasteのDataTransfer解釈（native/fallback共通） | 単体テスト（paste adapter） | `test:e2e`（`paste-drop-observation` / `paste-drop-boundary`） | OSのCtrl+V / 右クリックPasteの最終経路、クリップボードの実挙動 | D |
| DropのDataTransfer解釈（native/fallback共通） | 単体テスト（drop adapter） | `test:e2e`（`paste-drop-boundary`） | OSのドラッグ＆ドロップの最終経路 | E |
| 候補の採否・保留、レビューUIの操作 | `mmi inspect --json`、ledger、`mmi provenance --json` | 現時点でなし（VS CodeコマンドのE2E未整備） | レビュー画面の操作・視認性・取消 | — |
| PDF/印刷の改ページ・用紙向き・別紙参照 | `mmi render` / `mmi materialize`の論理表 | `test:e2e:practical`（該当する範囲） | 実際のPDF/印刷プレビューの見え方 | F / G2 |
| プレビュー内リンク・カードから原本を開く | `mmi render --to html`の`href` | `test:e2e`（`markdown-preview-entry`のHTML契約） | クリック時のVS Codeの開き方 | A / F |
| カスタムエディタ/プレビューの外観 | なし | なし（DOM/CSSの最終表示） | すべて | A / F |
| Excelの保存・取消/Undo・取得不能 | `mmi check` / `mmi inspect` | `test:e2e:coauthoring`（Windows＋Excel） | Excel側の操作感・確認ダイアログ | D/Eの前提 |

## 2. 人に残す依頼文（提示層だけ）

実機確認を依頼するときは、次の項目だけを列挙する。CLIと自動E2Eで見られる項目を依頼文へ混ぜない。

1. **Checklist A / F**: Markdown Previewで、表・カード・エラーが視覚的に壊れていないこと。プレビュー内リンクから原本が開くこと。
2. **Checklist B**: Problemsパネルで、診断の位置・行ジャンプ・クリック遷移が期待どおりであること。ホバーと電球メニューが到達可能であること。
3. **Checklist C**: 補完候補の表示位置・選択・挿入結果。`#`補完のknown unstableはPaste/D&Dの失敗と混ぜない。
4. **Checklist D / E**: OSのCtrl+V / ドラッグ＆ドロップで、native経路またはfallback経路が実際に選ばれ、意図した参照が挿入されること。
5. **Checklist F / G2**: PDF/印刷の改ページ・用紙向き・別紙参照が、実際の印刷プレビューで意図どおりであること。
6. **Candidateレビュー**: 採否・保留・取消の操作と、レビュー画面の視認性。

## 3. 併用執筆（#514）の人手確認

#514の受入条件のうち、台本が代わりにできない部分だけを、人が確かめる。実ExcelとVS Codeの台本（`test:e2e:coauthoring`）が、すでに次を確かめている。人は繰り返さなくてよい。

- 保存した値のプレビューへの反映、固定範囲の外への行の追加、範囲の中への行・列の挿入、見出しの変更、シート名の変更、ブックの削除、新しいシートの目録への追加。
- 参照の描画と目録の表示が、原本のハッシュを変えないこと。
- 各場面の画面。環境変数`MMI_COAUTHORING_SHOTS=<出力先>`を指定すると、場面ごとにVS Codeのウィンドウを撮影する。日本語の表示は、言語パックを入れた2回目の起動から使える。

人が確かめるのは、次の4つである。30分ほどを見込む。

### 準備

- Windows、Excel、通常版のVS Codeを使う。
- 実作業に近い設計ブック（`.xlsx`）と、それを参照するMarkdownを、ワークスペースに置く。実作業のブックは、コピーを作ってから使う。
- 操作の前後に、原本のハッシュを`Get-FileHash <ブック> -Algorithm SHA256`で記録する。
- 画面の言語（日本語か英語）を記録する。

### 手順1: 案内付きの参照作成（EW02、EW03、EW07）

1. Markdownを開き、`MMI: 参照を作成・編集（ブック→シート→範囲→確認）`（`Ctrl+Alt+M`）を実行する。
2. ブック、シート、範囲の順に選ぶ。候補にない範囲は、`A1範囲を入力…`で入れる。
3. プレビューを見て確定する。
4. 同じ操作をもう一度行い、途中の選択で取り消す。
5. 確定した直後に、Undoを1回行う。

期待する結果は次のとおり。確定する前に、実際の描画が見える。曖昧な候補は、自動では選ばれない。確定すると、周囲の本文を変えずに、参照だけが入る。取り消した場合は、文書が変わらない。Undoを1回行うと、参照が入る前に戻る。

### 手順2: 新しい表と新しいブック（EW02）

1. 既存のブックに新しいシートと表を足して、Excelで保存する。開いたままのVS Codeで、表の目録に現れることを確かめる。再読み込みはしない。
2. 新しいブックを作って保存する。目録か案内付きの作成から、参照できることを確かめる。

### 手順3: 保存した後の更新と、範囲の見直し（EW04、EW05）

台本が確かめた経路を、人の手のExcel操作で1回ずつ確かめる。

1. Excelで値を直して保存する。プレビューが更新されることを見る。
2. 参照の範囲の外と中に、行を足して保存する。
3. 見出しを変えて保存する。
4. シート名を変えて保存する。

どの場合も、プレビューと「問題」パネルを見て、書き手が範囲や指定を見直せるかを確かめる。範囲は自動では広がらない。そのことがメッセージから分かるかも見る。

### 手順4: 書き手による説明と実行（EW01、利用者にとっての価値）

操作に慣れていない書き手に、手順1から3を、説明なしで行ってもらう。次を記録する。

- 参照先を、自分の言葉で説明できたか。
- 保存した後に、何を見て確かめたか。
- 行を足したときに、どう直したか。
- 迷った箇所と、不要だと感じた確認。

この結果は、台本の成功とは別に判断する。人の作業を止めないことを優先する方針（ADR-0019 D13）に照らして、執筆に役立つ範囲を決める。

### 記録欄

| 日付 | VS Code版 | OS | 画面の言語 | 手順 | 結果 | 原本のハッシュ（前→後） | 気づき |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | 1.xx | Windows | 日本語 / 英語 | 1 | 合格 / 不合格 | `sha256…` → `sha256…` | |

MMIの操作の前後でハッシュが同じなら、MMIは原本を書き換えていない。人がExcelで保存した区間は、別の行に分けて記録し、MMIの操作と混ぜない。

## 4. 自動E2Eへ移す候補

次の項目は、現在は人または未整備のE2Eに残っている。移せるものからIssue化する。

- **CandidateレビューUIの採否・保留**: VS Codeのコマンド・WebviewメッセージをExtension Hostから駆動できるなら、`test:e2e`へ追加できる。提示層の見た目は人に残す。
- **Problemsの行ジャンプ**: `vscode.executeDefinitionProvider`等では代替できず、UI操作が必要。自動化するならExtension Hostのコマンド実行で診断位置を取得し、ジャンプ後のエディタ選択範囲を確認する。
- **ホバー/電球メニュー**: `vscode.executeHoverProvider`で内容は取れるが、電球メニューの到達性はUI操作に依存する。内容の自動確認と、到達性の人確認を分ける。
- **PDF/印刷**: 現状はPDF生成ツールに依存する。生成したPDFのページ数・用紙向き・改ページ位置を機械的に検査できるなら自動化する。

## 5. 実機確認の記録

`vscode-e2e-testing.md`の`Suggested manual result log template`に、実施したChecklist、host class、VSCode版、OS、結果を残す。自動E2Eの結果は、`release:candidate`の`release-evidence.json`とCIの実行URLへ結び付ける。過去の版の結果を現在の証拠にしない。

## 6. 関連

- [VS Code E2E手順](vscode-e2e-testing.md)
- [開発環境](developer-setup.md)
- Issue #580、#521、#519、#597
