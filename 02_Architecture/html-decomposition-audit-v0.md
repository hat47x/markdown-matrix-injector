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
5. Ledgerのsource/locator/kind、Candidate fingerprint、source digest、出力パス/digest、既存のbatch変換条件、review stateを照合する。破損Ledgerを読めても有効とは扱わない。
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
