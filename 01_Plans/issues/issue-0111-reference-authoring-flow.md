# Issue: 表参照の作成・編集と修正候補

## Meta
- Type: Feature
- Status: In Progress（2026-09-24実装。実機での利用者観測が残り）
- Priority: High
- Scope: src/dx（作成/編集UI）, extension.ts, parser, docs
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Related Design: [ソースモデル](../../02_Architecture/input-assistance-source-model.md)（プレビューと範囲評価）、[クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)§7（候補提示の見せ方）
- Dependency: issue-0110完了

## Execution Plan
### Proposed solution
[入力支援企画](../input-assistance-proposal.md)の参照作成・編集は実装済みである。残る実機観測は、[issue-0211](issue-0211-vscode-excel-coauthoring-flow.md)の既存設計書と新規Excel表を使う併用執筆に対応付ける。既存導線を使い、保存後の表示確認と行列変更時の修正で見つかった不足を直す。

### Acceptance criteria
- [x] ファイル→シート→範囲→表示→確認→挿入をキーボードで完了できる。戻る/中止では文書を変更しない。
- [x] 既存記法を読み込んで対象項目だけを更新する。未知キーと繰返しキーを失わない。Undo1回で元に戻る。
- [x] 実在する修正先だけをCode Actionに提示。候補が複数なら選択させ、解析できない記法を全置換しない。
- [x] 実エンジンのプレビューで0件・カード化・エラーを表示。文書version/原本mtimeが変わったら再検証する。
- [ ] 原本ハッシュ不変を確認し、初めて使う人と熟練者の表作成・別紙作成・参照変更を実機で観測する。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

**実装（2026-09-24、2026-10-09回帰補強）:** `src/dx/authoringFlow.ts`（案内付きコマンド`MMI: Create or Edit Embed`とCode Action）、`src/dx/embedEditor.ts`（記法の部分更新）、`src/dx/embedFixes.ts`（修正候補）、`src/dx/embedPreview.ts`（実エンジンの描画結果の要約）。Extension Hostのscripted flowでは、取消、Back、実preview、部分編集、1回Undoを同じauthoring経路で確認する。2026-10-09に周囲本文の保持と参照元bytes不変もこのE2Eへ追加した。

- ブック→シート→範囲→表示指定→確認の各段はQuickPickで、Backボタンで戻れる。Escでは文書を変えない。CSVはシート選択を省く。範囲は選んだシートの検出領域（表題・見出し付き）から選ぶ。
- 既存の`![[...]]`の上で実行すると現在の値から始め、変えたキーの区切りだけを書き換える。未知キー（`x-*`等）、繰返しキー（`formatColumn`）、触れていない区切りの表記は1バイトも変えない。挿入は1回の編集（Undo1回）。
- 確認段では実際の描画エンジンで描き、「本体3行×3列（見出しあり）」「該当行0件」「別紙カード」「エラー: …」を表示してから挿入させる。確認中に文書が変わったら挿入を中止し、原本が変わったらプレビューを作り直す。
- Code Actionはシート名・ファイルパスの不一致に対し、実在するシート（ブックを読む）・現在のMarkdownが属するworkspace folder内のファイルだけを類似度順に出し、壊れた部分だけを置き換える。複数ルートworkspaceでは文字列prefixで境界を判定せず、path segmentとrealpathで兄弟folder・symlink逸脱を除外する。案内付き編集が既存参照を読む場合もrenderer/diagnosticsと同じ`resolveSourcePath`規則を使い、workspace-root相対fallbackを保ちながら境界外sourceは読まない。候補が1件のときだけ優先候補にする。解析できない記法には何もしない。

残りは次のとおりです。

- 初めて使う人と熟練者の表作成・別紙作成・参照変更の実機観測と、原本ハッシュ不変の記録（criterion 5）。
- 案内付きコマンドの状態遷移はExtension Hostのscripted flowで自動確認済み。実際のQuickPick描画・キーボード操作感はmanual-e2eで確認する。
- issue-0211のA〜Fで、既存設計書の参照、新しい表、固定範囲外の行追加、範囲内挿入、見出し・シート名変更後の参照修正を確認する。既存のチェック済み条件は今回再試験した結果ではない。
