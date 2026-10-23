# HTML分解後の整合性監査 — read-only PoC v0

- 状態: **Proposed / 未受入**。実コードと自動テストを追加した段階。
- 対応Issue: [#553](https://github.com/hat47x/markdown-matrix-injector/issues/553)
- 基準: PR #609（2026-10-20 mainへマージ）、`commitHtmlDecomposition`の**通常失敗時rollbackのみ**という保証境界。
- 対象: ローカル静的HTMLの明示ID断片を、承認済みの`sourceDigest`・`expectedFingerprint`・出力先に従って保存した場合。

## 目的

`html-commit`では断片ファイルを個別に公開した後で、共有`mmi.ledger/v1`を更新する。OS停止、プロセス強制終了、外部操作などで、**出力が一部または全部存在しても、Ledgerがその状態を記録していない可能性**がある。

このギャップに対して、既存のread-only `html-plan --preview`を再計算し、**原本、各成果物、Ledgerの現在の一致・不一致を記録する**検査を最小化する。削除・補修・再承認は自動化しない。

## 検査結果の意味

| 結果 | 判定条件 | 人が次に確認すること |
| --- | --- | --- |
| `complete` | 指定source digestが一致し、分割計画に阻害がなく、全出力のbytes digestと対応Ledgerが一致 | 実際の納品/HTML表示・依存閉包は別検証 |
| `incomplete` | 原本は一致するが、出力の欠落/改変/unsafe path、Ledgerの欠落/変更/破損がある | 出力やLedgerを勝手に削除しない。欠落だけか、利用者が編集したかを確認 |
| `stale` | 元HTMLのbytesが承認済みsnapshotから変化 | 新しい原本と断片の再レビュー |
| `blocked` | 既存の計画が参照未解決、断片依存などの阻害を報告 | 分割対象や依存の修正を人が判断 |

`complete`は**観測時点の機械的整合性**であり、Crash-atomicity、Detached、納品できる完全なHTML、意味的同等性、受入済み業務事実を示さない。

## 検査方法

新しいApplication関数 `auditHtmlDecomposition(options)` を、`commitHtmlDecomposition`と同じ承認済みmanifest相当の入力（sourcePath/workspaceRoot/ledgerPath/sourceDigest/selections）で呼ぶ。

1. workspace内の原本・Ledgerパスを検査。symlinkを含む入力は読み取らず拒否。
2. 原本のbytesからdigestを確認。一致しない場合は`stale`を返し、断片の「完了」を検査しない。
3. 同じ`previewHtmlDecomposition`で全断片・リンク書換え・expected output digestを再計算。阻害があれば`blocked`とする。
4. 各出力について「存在しない」「期待digestと一致」「bytesが変更されている」「symlink等でunsafe」を区別する。ここでは参照先を修復しない。
5. Ledgerのsource/locator/kind、Candidate fingerprint、source digest、Claim basis、lineage hints、出力パス/digest、既存のbatch変換条件、review stateを照合する。保存時に重複記録した`conversion.outputDigest`も、実出力のdigestと一致する必要がある。破損Ledgerを読めても有効とは扱わない。
6. 最後に再び原本digestを確認し、監査中の原本変更を`stale`へ落とす。

実装は `src/application/auditHtmlDecomposition.ts` と `test/auditHtmlDecomposition.test.ts` のみ。**新CLIコマンド、MCP書込操作、Ledger/Notation schemaは追加しない**。別の並行PRが`src/cli/mmi.ts`を編集しているため、公開面を今回拡張せず責任と差分を限定する。

## 負例・反証条件

- **クラッシュ境界A**: 全HTMLが生成されたがLedgerが存在しない → 出力`matching`、Ledger`missing`、全体`incomplete`。
- **クラッシュ境界B**: Ledgerは残るが1ファイルが欠落 → 一方が`missing`、全体`incomplete`。
- **外部編集**: ファイルbytesだけが変更されLedgerが従前のまま → `changed`と`matching`を併記。勝手に上書きしない。
- **レビュー変更**: Ledgerが別のstateやdigestになった → 出力と別に`changed`を示す。
- **原本更新**: 断片外のコメント1文字の変更でも全原本digestが不一致 → `stale`。
- **危険なパス**: 出力がsymlinkなどの場合はリンク先を読み取らず`unsafe`、原本・Ledgerがsymlinkの場合は拒否。
- **再現性**: 監査前後の原本、Ledger、断片bytesが等しく、監査では新しいディレクトリを作らない。

## 保証と後続依存

このPoCは**一括保存の修復実装ではない**。ファイルとLedgerの同時公開、クラッシュに耐えるコミット記録、並行プロセス間の排他、OSのpath raceまでを原子的に保証しない。監査で`incomplete`を検出した場合も、原因がクラッシュか人による編集かは機械的に決定しない。

人が必要な判断を行った後、元のレビュー済みdigestを使って`html-commit --commit`を再試行できる場合がある。ただしファイルが変更/unsafeのときは、既存のno-overwriteを尊重して停止する。自動削除・自動再採用は避ける。

**未検証**: 本PR headでのビルド/自動テスト、配布用CLI、Windows実機・ブラウザー・PDF品質。この監査はApplication内のPoCであり製品UIからの利用受入は未実施。

## 追加観測・回復判断票（2026-10-24レビュー）

本監査が`incomplete`を返したとき、**機械的な状態確認**と**人間が受け入れる修復判断**を区別する。

| 原本 | 出力 | Ledger | 確認する意味 | 次の操作候補 |
| --- | --- | --- | --- | --- |
| 一致 | 全件一致 | 全件一致 | 指定バッチの機械的整合性あり | 納品/表示/Detachedの別レビュー |
| 一致 | 全件一致 | 欠落/破損 | 書出し成功後に台帳確定できなかった可能性。ただし過去の削除・改変とも識別不可 | 既存成果物の確認と台帳の出所レビュー後に回復可否を判断 |
| 一致 | 一部欠落 | 全件一致 | Ledgerはあるが資産が欠けている | 生成物の保全・欠落原因調査。承認済manifestで再生成できるか検証 |
| 一致 | 変更 | 一致 | 保存後にファイルが編集された可能性 | 元の資産を上書きせず差分確認。自動削除・置換は見送る |
| 一致 | 全件一致 | 来歴/変換条件が変更 | bytesとレビュー記録の結合が崩れている | Claim basis、lineage hints、変換digestを人が再確認 |
| 不一致 | 任意 | 任意 | 元HTMLのSource Digestが承認時から変化 | 新しいsnapshot/候補を再レビュー |
| 一致 | symlink等unsafe | 任意 | 参照先の安全境界が未確認 | 作業を停止してWorkspaceのパスを点検 |

本PoCは既存のLedger全体の余分な記録、計画外ファイル、監査時点以後の外部更新までは閉包検証しない。出力ファイルとLedgerは同時にロックしていないため、`complete`は**一時点の観測**に限る。異常を見つけても、監査が`html-commit --commit`を自動実行することはない。

### 検証証拠の段階

- 2026-10-21時点のPR #641 `16f447f...`では、Ubuntu/Windowsのproduct laneで追加監査7テストがすべてPASS。Research-laneには失敗35件が残っていたが、前段PR #609と失敗テスト名は同一だった。Workflow結論はsuccess。これらを本追記後headのPASSと同一視しない。
- 追補では、成果物のbytesとLedger主要fingerprintが一致していても、**Claim basis、lineage hints、重複記録された変換digestが異なる場合は`changed`に分類**する。Ledger破損・symlink入力への負例を追加。
- このPRはApplicationレベルのread-only監査PoC。配布CLIやMCPの公開APIは増やさず、他PRの`mmi.ts`との衝突を避ける。
