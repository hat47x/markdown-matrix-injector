# Issue: Candidate生成の共通化リファクタ後の製品テスト9件を再確認する

## Meta
- Type: Bugfix / Test drift
- Status: Done（2026-10-13にNode 20で実行確認。対象9件は合格し、全体testの失敗は研究層の36件のみ）
- Priority: High（解消済み）
- Scope: src/application（workbookCandidateInventory / candidateReviewInventory）、src/cli、test（下記6ファイル）、package.json（コマンド一覧のテストが読む）
- Owner: hat47x（2026-10-13に引き取り）
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

## 2026-10-09 再確認

最新`main`を静的に再確認した。起票時の9件は、後続コミットにより実装とテストの形が一致している。

- #1: host parity testは旧`tableRegions`ではなく`application.detected`を参照する。
- #2〜#4: 一括取り込みは共有の表検出結果を`imageCandidates()`へ渡し、近傍表Claimをレビュー時と同じbasisで再構成する。却下/保留と採用履歴は`reviewedAt`で比較し、新しい判断だけを優先する。全画像が除外された場合は`extractImages()`を呼ばない。
- #5: Product baseline testと集計実装は`adjustments.table` / `adjustments.imageAlt` / `adjustments.total`の現行shapeで一致する。
- #6: JSON/YAML/XML Treeの再検証は、現行の`extract-standard-asset` planとformat別nested-list conversionを返し、テスト期待と一致する。
- #7・#8: `package.json`のactivation eventsとcontributed commandsは現行integration testの一覧と一致する。
- #9: `mmi artifact ... --json`は人間向け表示ではなくJSONを出力し、現行testは`--json`を指定している。

この再確認は実行結果ではない。この作業環境ではGitHubへのcloneがDNS制約で失敗し、Node 20 suiteを実行できなかった。したがってAcceptance criteriaは、Node 20で対象6ファイルと全体testを実行するまで完了扱いにしない。

## 2026-10-12 実行結果

Node 20.20.2（WSL2）で対象6ファイルを実行し、63件すべて成功した。起票時の9件に該当する各テストもすべて通過した。

同じ環境で全体suiteも実行した。実行時の`HEAD`と`origin/main`はともに`1dc3ae9ad546e61a10e6724fcd3f17bdc4b3abd0`だった。1,996件中1,959件成功、36件失敗、1件skipとなった。失敗はJev、凍結handoff/SAI2、構造化artifact、ワークシート書式・annotation、XLSX fixtureの各研究・固定証拠suiteにあり、対象6ファイルと他の製品テストに失敗はなかった。件数は以前記録した約36件の既知研究層失敗と一致する。凍結テストと製品実装は変更していない。

確認コマンド:

```sh
node --import tsx --test test/candidateInventoryHostParity.test.ts test/importMaterialization.test.ts \
  test/candidateReviewProductBaseline.test.ts test/aiHandoffTransformationValidation.test.ts \
  test/extensionIntegration.test.ts test/cognitiveArtifactCli.test.ts
node --import tsx --test ./test/*.test.ts
```

## 2026-10-13 実行確認

最新`main`（`1dc3ae9`）にこのIssueの追加修正を載せ、Node 20.20.2（WSL）で実行した。

- `tsc -p tsconfig.product.json --noEmit`: エラー0件。
- 対象6ファイルと`imageCli`・`importCli`（計8ファイル）: 95件中95件が合格。
- 全体test: 1997件中1960件が合格、36件が失敗。失敗はすべて研究層（フィル影響、SheetJSのテーマ色、Jev、SAI、凍結ハンドオフ、Census、OPC識別）で、このIssueの9件は含まない。

### 9件の原因

別の作業者による静的な再確認（2026-10-09）とは独立に、Node 20で各テストの失敗を読み直した。結論は次のとおりである。

| # | 正しい側 | 原因 |
| --- | --- | --- |
| 1 | 製品 | テストが、戻り値に存在しない`application.tableRegions`を読んでいた。名前は`detected`で、中身はCLIの`sheets`と一致する |
| 2〜4 | テスト | 製品の退行。`994a0a5`でレビュー一覧が表範囲付きのCandidateを作るようになったが、一括取り込みは表範囲なしで作っていた。Claim basisが一致せず、画像の却下・保留が無視された |
| 5 | 製品 | テストの期待値の誤り。固定データの修正件数は表1件と画像alt1件で合計2。集計実装はリファクタの影響を受けていない |
| 6 | テスト | 製品の欠陥で、リファクタより前からあった。`a00095f`の検査が、JSON/YAMLのルートを表す空文字のポインターを「パス無し」と拒否していた |
| 7・8 | 製品 | テストの一覧の更新漏れ。`2c6f8cc`（issue-0207）で`searchObservation.*`の3コマンドが追加された |
| 9 | 製品 | テストの取り込み処理の誤り。`node --test`が標準出力へ流す内部のバイナリフレームを、`captureMain`がCLIの出力と一緒に取り込んでいた。CLIは仕様どおりJSONを出していた |

### 追加で見つかった退行

`src/cli/extract.ts`のレビュー時の画像取り出し（`expectedCandidate`の照合と`finalizeReviewedImageExtraction`）も、表範囲なしでCandidateを作り直していた。VS Codeのレビューで表の近くの画像を選ぶと`MMI_IMAGE_REVIEW_STALE`で拒否される。この経路は9件のテストでは検出されなかった。

表範囲の検出を`importAssist/tableRegions.ts`の`detectedTableRectsBySheet()`へ共有し、一括取り込みと`extract.ts`の両方で使うように直した。`test/imageCli.test.ts`のレビュー用Candidate補助関数は、実際のVS Codeの流れに合わせて共有のレビュー一覧を通す形にし、表の近くの画像を取り出す回帰テストを1件足した。`extract.ts`の修正を戻すと、`imageCli`の4件が`MMI_IMAGE_REVIEW_STALE`で失敗する。

## 再現手順

```sh
# Node 20 を使う（非ログインのWSLシェルは/usr/bin/node = Node 18 を選ぶ）
cd 03_Implement && npm ci
node --import tsx --test test/candidateInventoryHostParity.test.ts test/importMaterialization.test.ts \
  test/candidateReviewProductBaseline.test.ts test/aiHandoffTransformationValidation.test.ts \
  test/extensionIntegration.test.ts test/cognitiveArtifactCli.test.ts
```

## 判断結果

1. **#1:** Applicationの`detected`を現行の返却値とし、テストも`detected`を使う。CLIとApplicationのシート別検出範囲が一致することを比較する。
2. **#2〜#4:** 一括取り込みは共有表検出結果から画像候補と近傍表Claimを再構成する。却下・保留は対象画像とその判断時のbasisに結び付け、同一画像の新しい判断を優先する。すべての画像を除外した場合はassetやledgerを書かない。
3. **#5:** Candidate review集計の現行契約である`adjustments.table`、`adjustments.imageAlt`、`adjustments.total`を使う。
4. **#6:** 既存の`extract-standard-asset` review planを返し、format別のnested-list変換を使う。
5. **#7・#8:** コマンドとactivation eventの正本は`package.json`とし、テストはその定義に追従する。
6. **#9:** `mmi artifact ... --json`はJSONを出力する。テストも`--json`を指定してJSONとして検証する。

## Acceptance criteria

- [x] 上記9件が、Node 20で全て合格する（2026-10-13）。
- [x] 研究層の凍結テスト（固定されたダイジェストを検証するもの）は編集しない。
- [x] 判断に迷ったものは、テストを緩めず、実装とテストのどちらが正かを記録する（「判断結果」と、上の「9件の原因」）。
- [x] 全体テストで、この9件以外の新しい製品テストの失敗が増えていない（失敗36件はすべて研究層）。

## Validation plan

上記の再現手順で9件を実行し、その後`node --import tsx --test ./test/*.test.ts`で全体の失敗一覧を取り、研究層の既知の失敗を除いて残りがないことを確かめる。

## Remaining work

- 研究層の既知の失敗（36件）は別Issueとして扱う。
- 標準出力を`process.stdout.write`の差し替えで取り込むCLIテストが、ほかに11ファイルある。`main()`が実際の非同期I/Oを行うと、#9と同じ不安定さが出るおそれがある。`cognitiveArtifactCli.test.ts`は文字列だけを取り込む形に直っているが、ほかは未点検である。必要になった時点で別Issueにする。
