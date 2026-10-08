# Issue: Candidate生成の共通化リファクタで、製品テスト9件が食い違ったまま`origin/main`が赤い

## Meta
- Type: Bugfix / Test drift
- Status: Open
- Priority: High（`origin/main`の全体テストが、この9件で失敗し続けている）
- Scope: src/application（workbookCandidateInventory / candidateReviewInventory）、src/cli、test（下記6ファイル）、package.json（コマンド一覧のテストが読む）
- Owner: 未定。担当者の割り当てが必要（起票時点で、リファクタを行った作業者を特定できなかった）
- Expected verification level: unit

## Traceability
- Related: 2026-10-07のリファクタ系コミット（`dc83af3` application: share workbook Candidate generation、`a1c8b0b` cli: consume shared workbook Candidate snapshot、`4694b41` cli: reuse shared table detection snapshot、`761b5fc` docs: mark Candidate generation host convergence）
- Related: [issue-0196](issue-0196-materialize-detach-check.md)の「origin/main全体テストの内訳」（この件の発見元）
- Not in scope: 研究層（フィル・SAI・Jev・凍結ブロブ等）の既知の失敗。これは別扱いで、37件前後が以前から失敗している

## 背景

2026-10-08時点の`origin/main`（`06ab712`、Node 20で全テスト）は、1931件中45件が失敗する。このうち研究層の既知の失敗を除いた9件は、Candidate生成の共通化リファクタの途中で、テストか実装のどちらかが古いままになったと見られる。製品の挙動が壊れたと確定したものではなく、「どちらを正とするか」の判断が要る。

## 9件の内訳（6ファイル）

| # | ファイル | テスト | 観測された失敗 | 見込まれる原因 |
| --- | --- | --- | --- | --- |
| 1 | `test/candidateInventoryHostParity.test.ts` | CLI inspect and VS Code review inventory produce identical image Candidates | `TypeError: Cannot read properties of undefined (reading 'map')`（61行目）。テストは`application.tableRegions`を読むが、`workbookCandidateInventory`の戻り値は`detected` / `tablesBySheet`に変わっている | 名前の変更。テストが古い |
| 2 | `test/importMaterialization.test.ts` | bulk import preserves exact rejected and deferred image decisions | 期待値とのdeep-equal不一致 | 一括取り込みの画像判断の保存経路が、リファクタで変わった可能性 |
| 3 | `test/importMaterialization.test.ts` | a newer exact rejection overrides older adopted history | 同上 | 同上 |
| 4 | `test/importMaterialization.test.ts` | when every image is rejected or deferred, bulk import writes no image assets or ledger | 同上 | 同上 |
| 5 | `test/candidateReviewProductBaseline.test.ts` | aggregate summarizes existing content-free review observations without source identity | 期待値とのdeep-equal不一致 | レビュー一覧の集約（`candidateReviewInventory`）の出力形が変わった可能性 |
| 6 | `test/aiHandoffTransformationValidation.test.ts` | explicit JSON/YAML/XML Tree transformations return only existing nested-list review plans | `json`の差分 | Tree変換の計画の出力形の変化 |
| 7 | `test/extensionIntegration.test.ts` | extension integration boundaries keep canonical native providers and compatibility fallback commands separate | `package.json`のactivationEvents / contributes.commandsの期待値との不一致 | 後から追加されたレビュー用コマンドが、テストの一覧に入っていない |
| 8 | `test/extensionIntegration.test.ts` | native provider metadata stays API-visible without collapsing command fallback visibility | 同上 | 同上 |
| 9 | `test/cognitiveArtifactCli.test.ts` | CLI artifact verifies a local file without copying or downloading it | 標準出力のバイナリをJSONとして読んで`SyntaxError` | テストが、CLIの出力形式（バイナリ/JSON）の変化に追従していない可能性 |

※ 2〜4、5、6、9は、差分の詳細をまだ読み切っていない。担当者は、Node 20で該当ファイルを単独実行し、差分を直接確かめること。

## 再現手順

```sh
# Node 20 を使う（非ログインのWSLシェルは/usr/bin/node = Node 18 を選ぶ）
cd 03_Implement && npm ci
node --import tsx --test test/candidateInventoryHostParity.test.ts test/importMaterialization.test.ts \
  test/candidateReviewProductBaseline.test.ts test/aiHandoffTransformationValidation.test.ts \
  test/extensionIntegration.test.ts test/cognitiveArtifactCli.test.ts
```

## 決めてほしいこと

1. **#1:** `application`の戻り値に`tableRegions`を戻すか、テストを`detected`へ書き換えるか。意図は「CLIのシートごとの表の範囲と、アプリケーションの範囲が一致すること」。
2. **#2〜#4、#5、#6:** 実装の出力が正しいのか、テストの期待値が古いのか。判断の根拠は、リファクタ前（`dc83af3`の親）の出力。
3. **#7、#8:** コマンド一覧のテストに、後から追加されたコマンドを反映するか。`package.json`を正とする。
4. **#9:** CLIの出力形式（JSON / バイナリ）のどちらを正とするか。

## Acceptance criteria

- [ ] 上記9件が、Node 20で全て合格する。
- [ ] 研究層の凍結テスト（固定されたダイジェストを検証するもの）は編集しない。
- [ ] 判断に迷ったものは、テストを緩めず、実装とテストのどちらが正かを本Issueの「決めてほしいこと」に記録する。
- [ ] `origin/main`の全体テストで、この9件以外の新しい失敗が増えていない。

## Validation plan

上記の再現手順で9件を実行し、その後`node --import tsx --test ./test/*.test.ts`で全体の失敗一覧を取り、研究層の既知の失敗を除いて残りがないことを確かめる。

## Remaining work

- 担当者の割り当て（利用者の判断が必要）。
- 研究層の既知の失敗（別Issueとして扱う）。
