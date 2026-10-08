# Issue: 文脈に沿う値補完と軽量な候補取得

## Meta
- Type: Feature
- Status: In Progress（2026-09-24実装。実機での多環境検証が残り）
- Priority: High
- Scope: src/dx/autocompleteProvider.ts, src/extension.ts, params.schema.json同期テスト
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Related Design: [ソースモデル](../../02_Architecture/input-assistance-source-model.md)（範囲候補は原本座標で提示する）
- Dependency: issue-0114完了

## Execution Plan
### Proposed solution
[入力支援企画](../input-assistance-proposal.md)の部分補完と範囲候補は実装済みである。残る実環境検証を、[issue-0211](issue-0211-vscode-excel-coauthoring-flow.md)の併用執筆にも対応付け、新しいExcel表の保存後や原本変更後に候補を選んで書き続けられるかを確認する。

### Acceptance criteria
- [x] 未完成記法のカーソル区間を解析し、途中の値だけを置換して後続記法と本文を保持する。コード例と閉じた記法の外では候補を出さない。
- [x] 既知キーと値の候補・日本語説明をschemaと同期する。header、mode、orientation等の値を実機で選べる。formatColumnの反復と未知キーを保持する。
- [x] 選択シートだけから範囲を提示する。固定候補でWorkbookを読まず、mtimeキャッシュとキャンセルを使う。
- [ ] CSV/Excel/XML/TSV、multi-root、IME、Undo、原本変更、遅い旧要求の破棄を検証する。
- [x] header行番号と範囲省略クエリの既存契約を実装前に照合し、説明の不一致を上流に記録して解決する。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

**実装（2026-09-24）:** `src/dx/completionContext.ts`（カーソル区間の解析）、`src/dx/completionCandidates.ts`（候補と日本語説明）、`extension.ts`の補完プロバイダ。単体テスト`test/completionContext.test.ts`（9件）、Extension Host e2e（実VS Code 1.136、WSLg）で置換範囲とコードブロック内の抑止を確認。

- 置換は**カーソル下の値だけ**（`mode=ta|ble&x-keep=1`で`ta`〜`ble`のみ）。後続の記法・未知キー・本文は保持。フェンス（```/~~~）・インラインコード内、閉じた`![[...]]`の後では候補を出さない。
- キー・列挙値は`MMI_KNOWN_PARAMETER_CONTRACT`から出し、`params.schema.json`とのキー・列挙・パターン一致と日本語説明の網羅を単体テストで検査する。使用済みキーは隠し、繰返し可の`formatColumn`は残す。
- 範囲は**記法で選ばれたシートだけ**から、領域検出（issue-0115）の表領域を表題・見出し付きで先頭に、次に使用範囲を出す。以前は全シートの使用範囲を混ぜて出していた（不具合）。`columns=`は範囲が検出領域と一致するとき、範囲内の相対列文字を見出し名付きで出し、`A,`の後は追加分だけを出す。
- ブックはmtimeキャッシュ（`WorkbookCache`）経由で読み、固定語彙（mode等）の候補ではブックを読まない。キャンセルと文書versionの変化で古い結果を捨てる。
- 契約の照合: `header=<n>`は変換後の第n行（1始まり）で記法仕様§6・schema・契約が一致。範囲省略（`![[a.xlsx#Sheet1?mode=card]]`）でもクエリ補完が働くことをテストで確認。上流への不一致記録は不要だった。

残りは次のとおりです。

- CSV/Excel/XML/TSV、multi-root、IME、Undo、原本変更、遅い旧要求の破棄の実機検証（criterion 4）。
- 既存のe2eの「#の後のシート候補」の既知の不安定さが解消したかの継続観測。
- issue-0211の新しいブック・シート・表の保存後と構造変更後の補完を確認する。キャッシュの読取り経路だけで、実機での候補更新済みとは扱わない。
