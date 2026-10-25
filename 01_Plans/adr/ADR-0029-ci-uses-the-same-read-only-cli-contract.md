# ADR-0029: 利用者CIはCLIと同じ読み取り専用契約を使い、失敗条件を明示する

- Status: Proposed
- Date: 2026-10-21
- Deciders: MMI Lead Agent（実装案の提示。採否はHuman Sponsor）
- Scope: `.github/actions/mmi-check`、`scripts/ci`、利用者向けCI文書
- Related: [ADR-0019](ADR-0019-ai-era-sier-document-value-and-policy.md) D13・D14、[ADR-0028](ADR-0028-per-document-provenance-report-contract.md)、Issue #526

## Context

利用者のリポジトリでは、参照の誤り、取り込んだ資産の鮮度、Linked参照の見直し漏れを、レビューのたびに人手で確認している。MMIのCLIには`check`・`provenance`・`--fail-on`があるが、CIから呼ぶための薄い手順と、ジョブを失敗させる条件の共通理解がなかった。

CIのために別の検査器やサーバを追加すると、CLIとCIで結果がずれる。原本をネットワークから取得したり、ジョブが台帳や成果物を書き換えたりする危険もある。

## Decision

利用者向けCIを、**CLIと同じApplication層・同じ読み取り専用契約**の薄いラッパーとして提供する。

1. **ActionはCLIを呼ぶだけにする。** `.github/actions/mmi-check`は`mmi check`と`mmi provenance --json`を実行し、独自の判定器を持たない。CIとローカルで結果が一致する。
2. **原本・台帳・成果物・Markdownを書き換えない。** 書き込むのはGitHubのJob Summaryと、利用者が明示した`--summary`ファイルだけとする。ネットワークから原本を取得しない。
3. **失敗条件を明示する。** 既定の`fail-on`は`diagnostics,review-stale,missing`とし、`stale`（Extractedの変更）は既定では失敗にしない。新しい参照が`unrecorded`であることだけでは失敗にしない。厳格さは利用者が入力で選ぶ。
4. **見直し記録はリポジトリに置く。** `mmi-review-basis.json`をコミットし、Actionはそれを読む。記録の自動更新はしない。
5. **ActionはMMI CLIの導入を前提にする。** CLIの配布（#500）とバージョン固定は利用者の責任とし、ActionはPATH上の`mmi`を使う。導入方法は文書に示す。
6. **実PRでのキット検証を完了条件にする。** 正常・参照の誤り・原本変更の3ケースを、基本設計書キットを複製したリポジトリで確認するまでは「実装済み・実PR未検証」と区別する。

## Consequences

- **Good:** 利用者は1つのActionで、参照エラー・Extractedの鮮度・Linkedの見直しを同じサマリで確認できる。CLIと同じ結果なので、ローカル再現とCIの差を説明しやすい。既定で止めすぎず、必要な厳格さを`fail-on`で選べる。
- **Bad:** CLIの導入とバージョン固定が利用者の負担になる。ActionはGitHub ActionsのLinux/WindowsランナーとGit Bashを前提にする。`unrecorded`を既定で失敗にしないため、見直し記録のない参照はサマリを見ないと気づけない。実PRでのキット検証は未実施。
- **Traceability:** 実装は`scripts/ci/mmi-ci.mjs`、`.github/actions/mmi-check/action.yml`。試験は`test/mmiCi.test.ts`。文書は`04_Documentation/ci.md`。

## Traceability

- Related Issues: [#526](https://github.com/hat47x/markdown-matrix-injector/issues/526)、[#500](https://github.com/hat47x/markdown-matrix-injector/issues/500)、[#522](https://github.com/hat47x/markdown-matrix-injector/issues/522)
- Related Docs: [CIでの検査](../04_Documentation/ci.md)、[文書ごとの出典報告](../04_Documentation/provenance-report.md)
