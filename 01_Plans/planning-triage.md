# 作業対象の選び方

[現在の作業](README.md)とユーザーの依頼、[GitHub Issues](https://github.com/hat47x/markdown-matrix-injector/issues)を照合し、関連するIssueを選ぶ。再開中の作業を優先し、Draftの提案を実装指示と取り違えない。

一覧が必要な場合はリポジトリルートで実行する。`--github`は`gh` CLIで未クローズのIssueを並べる。`gh`が無い環境では未取得として報告し、失敗にしない。

```sh
python 01_Plans/tools/planning_queue.py --github
python 01_Plans/tools/planning_queue.py --github --format json
```

出力は未確定のADR、`01_Plans/issues/`に保管した未完了のIssue（移管後は通常0件）、欠落したADR参照、GitHubの未クローズIssue。選んだIssueの受入条件と依存関係を確認し、必要な仕様・コードだけを読む。完了時にはGitHub上で状態をCloseし、検証結果を記録する。ツールの一覧は作業の自動承認や優先順位の決定を行わない。
