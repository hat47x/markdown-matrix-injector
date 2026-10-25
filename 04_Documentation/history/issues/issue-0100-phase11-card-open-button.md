# Issue: カードから原本ファイルを開く操作の実装と実機確認

この文書は当時のIssue記録です。2026年9月9日のWindows VS Codeでの最終確認が記録されています。旧commandリンク方式からADR-0015の拡張URI方式への変更、途中の未確認状態、最終的なExcel起動確認を時系列の履歴として保持します。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Note: 2026-09-09、Windows VS CodeでURIボタンをクリックし、許可画面をユーザーが操作した後にExcelで原本が開くことを確認。以下の旧方式の記述は履歴であり、現行方式はADR-0015。
- Scope: 03_Implement/src/core/renderCard.ts, 03_Implement/src/extension.ts (webview link handling), 03_Implement/media/markdown-matrix.css
- Expected verification level: unit (HTML構造) + manual-e2e (実webviewクリック挙動)

## Traceability
- Related Backlog/Phase: requirements.md Phase 4「画面UI: 『ファイル名・範囲・開くボタン』を持つリッチなリンクカードUI（クリックでenv.openExternal）」
- Related ADR/Spec: ADR-0011 (Card Open Affordance — 実現方式決定済み) / ADR-0010 (Product Completion Gate)
- 同種ギャップ: issue-0093 / issue-0099

## 背景
要件Phase 4はカードUIに「開くボタン（クリックで `env.openExternal`）」を求めるが、現在の `renderCard.ts` は
`mmi-card__title` と `mmi-card__meta` のみで、**開くボタンも `openExternal` 連携も未実装**（`openExternal` はsrc全体で0件）。
別紙カードから元ファイル（Excel等）をワンクリックで開けない。

## 留意点（未着手の理由）
- VS Code Markdownプレビューはsandboxed webviewであり、`command:` URI有効化やCSPの制約がある。`env.openExternal` 相当の
  挙動（OS既定アプリで開く）をwebviewのリンク/ボタンから安全に発火させる方式の検討が必要。
- クリック挙動の正しさは実webviewでしか検証できない（GUI必須）。「動くことを実証してからリリース」の原則（ADR-0010）に従い、
  ヘッドレス環境での盲目的実装は避け、本issueとして明示的にトラッキングする。

## 当時の実行計画（提案・未実施）
### 解決方針（当時の提案）
1. `renderCard.ts` に「開く」リンク/ボタン要素を追加（`mmi-card__open` 等）。リンク先は元ファイルの解決パス。
2. webviewからのファイルオープン方式を決定（`command:` URI + `enableCommandUris`、またはVS Codeが解決する相対リンク）。
   方式はADRで決定（不可逆な設計判断のため）。
3. `media/markdown-matrix.css` に開くボタンのスタイルを追加。
4. unitでHTML構造（リンク存在・解決パス）を固定し、manual-e2e（Checklist）で実クリック挙動を確認。

### 受入条件（Acceptance criteria）
- [x] カードUIにファイル名・範囲に加え「開く」操作要素が存在する（unitでHTML構造を固定）。
      実装: ADR-0011ハイブリッド方式 — ①見出し `mmi-card__title` を著者記述の相対パスへの素のリンク化
      （Strict/未信頼でも動作するbaseline）、②`mmi-card__open`「外部アプリで開く」ボタン
      （`command:markdownMatrixInjector.openSource?<encodeURIComponent(JSON [absolutePath])>`）。
      `test/renderCard.test.ts` 6テストで構造・エンコード・敵対的パスのエスケープ・ラウンドトリップ復元を固定。
- [x] `markdownMatrixInjector.openSource` コマンドを登録（`env.openExternal(Uri.file(path))`、引数検証・
      失敗時エラー通知付き）。package.jsonのcommand/activationEventと `extensionIntegration.test.ts` の
      完全一致アサーションを更新。
- [x] CSS: `.mmi-card__open`（screen: ボタン様式 / print: 非表示 — 紙面の別紙参照ブロックから除外）、
      `.mmi-card__title` のリンク化スタイル。`previewStyles.test.ts` のカバレッジロックへ追加。
- [x] webviewセキュリティ（command URIはtrustedのみ・baselineリンクによるgraceful degradation）方針が
      ADR-0011に記録済み。
- [x] `npm run build` / `npm test` pass（**226 pass / 0 fail**、conformance corpusのカード契約も無修正で通過）。
- [x] 文書配線: reference.md（Commands表 + Preview Stylesクラス表）、vscode-e2e-testing.md Checklist Fに
      カード開く操作の観測点2行を追加。
- [x] 実VS Codeプレビューでクリックすると元ファイルが開く（manual-e2e、GUI必須 — Checklist Fの
      追加観測点で確認する。ADR-0011 §5のとおり本項のみdelegated manual scope）。

### 2026-09-09 実機確認での更新

Windows VS Code 1.136.1で旧commandリンクをクリックしたが外部アプリは起動しなかった。ADR-0015で拡張URI方式に変更し、実装と単体・Extension Host検査は成功。上記ADR-0011のリンク方式は現在の実装を表さない。Windowsロックのため修正後のクリックは未確認であり、最終Acceptanceは未完了のまま維持する。詳細はissue-0109とリリース検証記録を参照。

### 最終確認（2026-09-09）

ユーザーのURI許可後にdesign.xlsxがExcelで開き、状態遷移シートを表示。画像07-excel-opened.pngを保存。原本14ファイルのSHA-256は検証前と一致。単体231件とExtension Hostも成功。最終Acceptanceを満たしたためDoneとする。詳細は04_Documentation/release-validation-2026-09-08.md。
