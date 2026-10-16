# GitHub Issueの書き方

Issueは作業を再開するためのメモです。対象、完了条件、検証、残作業を簡潔に書きます。短い修正に形式だけのIssueを増やす必要はありません。

状態はGitHubのOpen / Closedで表します。未検証事項を残したままCloseしません。

## このディレクトリの扱い

`01_Plans/issues/`は、2026-10-16にGitHub Issueへ移管する前にクローズしたIssueの保管場所です。新規の起票先ではありません。内容も保守しません。移管後に起票したIssueと、移管時に未クローズだったIssueは[GitHub Issues](https://github.com/hat47x/markdown-matrix-injector/issues)にあります。

## Issueに書くこと

```markdown
# 作業の目的

## Meta
- Type: Feature / Bugfix / Refactor / Docs / Test
- Priority: High / Medium / Low
- Scope: 変更対象
- Expected verification level: docs-check / unit / integration / manual-e2e

## Traceability
- Related ADR/Spec: 関連する仕様またはADR
- Dependency: 先に必要な作業

## Acceptance criteria
- [ ] 観測して判定できる完了条件

## Validation plan
具体的なコマンド、入力、期待結果。

## Remaining work
未解決事項と次の一手。完了時は実施した検証と残る制約に置き換える。
```

`docs-check`はリンクと内容の整合、`unit`は関連テスト、`integration`は結合確認、`manual-e2e`は実機操作を表します。必要な確認を組み合わせ、実施していない確認を含めません。実行コマンドは[開発環境](../../04_Documentation/developer-setup.md)を参照してください。
