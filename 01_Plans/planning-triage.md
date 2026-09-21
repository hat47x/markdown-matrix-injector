# 作業対象の選び方

[現在の作業](README.md)とユーザーの依頼を照合し、関連するIssueを選ぶ。再開中の作業を優先し、Draftの提案を実装指示と取り違えない。

一覧が必要な場合はリポジトリルートで実行する。

```sh
python 01_Plans/tools/planning_queue.py
python 01_Plans/tools/planning_queue.py --format json
```

出力は未確定のADR、未完了のIssue、欠落したADR参照。選んだIssueの受入条件と依存関係を確認し、必要な仕様・コードだけを読む。完了時には状態と検証結果を更新する。ツールの一覧は作業の自動承認や優先順位の決定を行わない。
