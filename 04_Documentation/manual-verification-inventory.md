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

## 3. 自動E2Eへ移す候補

次の項目は、現在は人または未整備のE2Eに残っている。移せるものからIssue化する。

- **CandidateレビューUIの採否・保留**: VS Codeのコマンド・WebviewメッセージをExtension Hostから駆動できるなら、`test:e2e`へ追加できる。提示層の見た目は人に残す。
- **Problemsの行ジャンプ**: `vscode.executeDefinitionProvider`等では代替できず、UI操作が必要。自動化するならExtension Hostのコマンド実行で診断位置を取得し、ジャンプ後のエディタ選択範囲を確認する。
- **ホバー/電球メニュー**: `vscode.executeHoverProvider`で内容は取れるが、電球メニューの到達性はUI操作に依存する。内容の自動確認と、到達性の人確認を分ける。
- **PDF/印刷**: 現状はPDF生成ツールに依存する。生成したPDFのページ数・用紙向き・改ページ位置を機械的に検査できるなら自動化する。

## 4. 実機確認の記録

`vscode-e2e-testing.md`の`Suggested manual result log template`に、実施したChecklist、host class、VSCode版、OS、結果を残す。自動E2Eの結果は、`release:candidate`の`release-evidence.json`とCIの実行URLへ結び付ける。過去の版の結果を現在の証拠にしない。

## 5. 関連

- [VS Code E2E手順](vscode-e2e-testing.md)
- [開発環境](developer-setup.md)
- Issue #580、#521、#519、#597
