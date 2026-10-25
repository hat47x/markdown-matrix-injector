# MMIの使い方と開発文書

MMIを初めて知った方は、[概要](overview.md)で「何ができるか」を確認してから、[チュートリアル](tutorial.md)で実際に表を表示してみてください。普段の仕事で使う方は[利用マニュアル](user-manual.md)、仕組みや記法を確認したい方はリファレンスや設計文書へ進めます。

下の一覧は、**やりたいことから読む文書を探すための案内**です。

| 目的 | 文書 |
| --- | --- |
| 最初の表を表示する | [チュートリアル](tutorial.md) |
| 既存設計書や新しいExcel表を使って本文を書く | [ExcelとMarkdownの併用執筆](excel-markdown-authoring.md) |
| Word文書の見出し・表・画像・コメントを確認する | [Word文書（.docx）の読み取り](word-source-adapter.md) |
| 操作を調べる | [利用マニュアル](user-manual.md) |
| AIエージェントから読み取り・検証を呼ぶ | [MCPサーバ](mcp-server.md) |
| 原本とMMIを外す | [原本とMMIを外す手順](detach-guide.md) |
| 文書が何を参照・取り込みしているか確認する | [文書ごとの出典報告](provenance-report.md) |
| PRで参照と鮮度を自動検査する | [利用者のCIでの検査](ci.md) |
| 実務に近い例を試す | [サンプル集](samples/practical/README.md) |
| 用途と全体像を知る | [概要](overview.md) |
| パラメータを調べる | [リファレンス](reference.md) |
| 記法を正確に扱う | [MMI記法仕様](spec/mmi-notation-v1.md) |
| 内部の処理を理解する | [動作リファレンス](how-it-works.md) |
| 開発・検証する | [開発環境](developer-setup.md)・[E2E手順](vscode-e2e-testing.md) |
| 追加機能の検証状況を確認する | [2026-09-24 入力支援機能の検証記録](validation-input-assistance-2026-09-24.md) |
| 次の開発作業を知る | [現在の作業](../01_Plans/README.md) |

機能の説明と記法仕様が異なる場合は記法仕様を優先し、不一致を修正します。入力支援機能は実装が進んでいます。検証済みの範囲と未確認事項は検証記録を参照してください。
