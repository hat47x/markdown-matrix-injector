# ADR-0028: 文書ごとの出典報告を、内容を写さない版付き契約として出す

- Status: Proposed
- Date: 2026-10-20
- Deciders: MMI Lead Agent（実装案の提示。採否はHuman Sponsor）
- Scope: `src/application`（報告の組み立て）、`src/core`（公開JSON Schema）、`src/cli`（`provenance`）、利用者・CI向け文書
- Related: [ADR-0019](ADR-0019-ai-era-sier-document-value-and-policy.md) D3・D8・D11、[ADR-0021](ADR-0021-candidate-cognition-lifecycle-reproducibility.md)、[ADR-0026](ADR-0026-word-source-adapter-read-only-boundary.md)、Issue #525・#522・#515

## Context

MMIの利用者は、一つの文書が何を参照し、何を取り込み、それが今も同じかを知るために、`manifest`・`impact`・`check`・`detach-check`・台帳を別々に見ている。AIエージェントも同じ確認を別々の出力から組み立てており、確認の抜けや二重作業が起きやすい。

一方で、報告に原本のセル値や本文をそのまま含めると、次の問題が生じる。

1. 報告をレビューやCIのログへ添付したとき、原本の値を意図せず広げる。
2. 同じ文書でも、値の変更と参照の変更を区別しにくくなる。
3. 報告の形式が実装の都合で変わり、AIやCIが読めなくなる。

また、Linked参照には「書き手がどの時点の論理表を確かめたか」の記録がまだない（#522）。この記録を空の一覧として報告すると、「見直し不要」と誤読される。

## Decision

文書ごとの出典報告を、**読み取り専用・内容を写さない・版付き**の契約として追加する。

1. **`mmi.provenance-report/v1`を公開契約にする。** `mmi schema provenance-report`でJSON Schemaを取得でき、`mmi provenance <doc.md> --json`が同じ形を返す。契約は`document`・`summary`・`linked`・`extracted`・`review`・`diagnostics`を持つ。
2. **原本の値を含めない。** 報告が持つのは、文書と原本のパス、シート・範囲、ダイジェスト、fingerprint、台帳の出力先・変換条件・レビュー状態、鮮度、診断コードだけとする。セル値・本文・コメント本文は含めない。値が必要な場合は、利用者が明示的に`inspect --values`等を使う。
3. **LinkedとExtractedを分ける。** Linkedは記法上の参照と現在の原本ダイジェストを、Extractedは台帳の採用記録と`checkExtractedProvenanceFreshness()`の結果を報告する。両者を一つの「参照」に混ぜない。
4. **見直し記録は別ファイルへ明示的に書く。** `mmi review-basis --write`が、参照ごとの論理表ダイジェストを`mmi-review-basis.json`（`mmi.review-basis/v1`）へ記録する。`provenance`は記録と現在の論理表を比較し、`fresh`・`stale`・`unrecorded`・`unverifiable`を区別する。記録は自動更新せず、1つでも読めない参照があれば部分的な記録を書かない。記録を記法へ書くかはHuman Sponsorの判断を仰ぐ（#522）。
5. **診断は`check`の結果を再利用する。** 報告は独自の検証器を持たず、CLIが`checkPaths()`で得た診断を渡す。`check`と`provenance`で診断が食い違わないようにする。
6. **報告は既定ではゲートではない。** `provenance`は情報を返し、終了コード0を基本とする。利用者が`--fail-on diagnostics,stale,review-stale,missing`を明示した場合だけ、該当件数で終了コード1を返す。既定の0を変えないことで、レポートとCIゲートを分ける。マージ・リリースの最終判断は既存の`check`・`detach-check`・release gateが持つ。
7. **書き込みをしない。** 報告の生成は、原本・Markdown・台帳・成果物を書き換えない。出力は`--out`で明示した場合だけ書き出す。

## Consequences

- **Good:** 人・AI・CIが同じ一つの報告から、参照先、取り込み資産、鮮度、未解決診断を辿れる。原本の値を報告へ広げずにレビューできる。形式が版付きなので、AI向けツールが安定して読める。Word等の新しいSource Adapterも、台帳と鮮度の契約に乗れば同じ報告へ現れる。
- **Bad:** 見直し記録は別ファイルであり、記録を忘れた参照は`unrecorded`のままになる。Linkedの`sourceDigest`は原本ファイル全体のダイジェストであり、参照した論理表のダイジェストではない（見直し判定は`review`側の論理表ダイジェストで行う）。報告はゲートではないので、CIで失敗させたい利用者には別途の判定が必要。台帳の`reviewedAt`など既存メタデータは報告に含まれるため、完全なバイト再現性は台帳に依存する。
- **Traceability:** 実装は`src/application/provenanceReport.ts`、`src/core/provenanceReportContract.ts`、`src/cli/mmi.ts`。試験は`test/provenanceReport.test.ts`、`test/provenanceCommand.test.ts`。利用文書は`04_Documentation/provenance-report.md`。

## Traceability

- Related Issues: [#525](https://github.com/hat47x/markdown-matrix-injector/issues/525)、[#522](https://github.com/hat47x/markdown-matrix-injector/issues/522)、[#515](https://github.com/hat47x/markdown-matrix-injector/issues/515)
- Related Docs: [Semantic Candidate契約 v1](../../02_Architecture/candidate-contract-v1.md)、[取り込み台帳](../../02_Architecture/import-ledger.md)
