# ADR-0027: AIエージェント向けMCPは読み取り・検証に限定する

- Status: Proposed
- Date: 2026-10-20
- Deciders: MMI Lead Agent（実装案の提示。採否はHuman Sponsor）
- Scope: `src/cli/mcp.ts`、CLI配布物、`skills/mmi`、MCP利用文書
- Related: [ADR-0019](ADR-0019-ai-era-sier-document-value-and-policy.md) D10・D11・D15、[ADR-0018](ADR-0018-cognitive-assistance-plane.md) D8・D11、[ADR-0020](ADR-0020-requirement-oriented-cognition-method-selection.md)、Issue #527

## Context

MMIの利用者には、人だけでなく、利用者が選んだAIエージェントも含まれる。ADR-0019 D10・D11は、外部LLMをMMIの内部に置かず、MMIが判断材料をローカルで作り、送信は利用者に委ねる境界を定めている。MCP（Model Context Protocol）は、そのAIエージェントがMMIの道具を呼ぶための標準的な入口になり得る。

一方で、AIエージェントに操作を公開すると、次の危険が増える。

1. 原本・台帳・成果物を、利用者の明示的なレビューなしに書き換える。
2. プロンプトインジェクションを含む文書を読み、その内容を指令として実行する。
3. `--root`の外を読む、symlinkをたどる、ネットワークへ出る。
4. AIが返した提案を、検証しただけで採用済みと誤認する。

CLIにはすでに読み取り・検証のコマンドがある。MCPのために別の権威経路を作ると、CLIとMCPで結果や境界がずれる。

## Decision

MCPサーバを**読み取り・検証専用**の入口として追加する。

1. **書き込み系を公開しない。** MCPのtoolsは`schema`・`inspect`・`html-audit`・`check`・`render`・`select`・`find`・`handoff`・`validate-*`に限る。`html-audit`は、レビュー済みの計画で静的HTML分割後の出力とLedgerを再照合するだけの読み取りツールで、2026-10-25に追加した（Issue #704）。`extract`・`import`・`materialize`・`html-commit`・`snapshot`は公開しない。抽出・取り込み・実体化は、利用者がCLIまたはVS Codeで明示的に行う。
2. **CLIと同じApplication層を呼ぶ。** MCPはCLIの`--json`またはテキストと同じ関数・同じ結果を使い、MCP専用の判定や権威を持つ層を作らない。parityを回帰テストで固定する。
3. **workspace rootを起動時に固定する。** 呼び出しごとにrootを上書きさせない。パスはlexical pathとrealpathの両方で検査し、`..`・root外絶対パス・symlink/junction経由の脱出を拒否する。
4. **ネットワークへ接続しない。** MCPサーバはstdioのみを使い、外部URLの取得・外部LLMへの送信・モデルの自動取得をしない。`handoff`はローカルのevidence packageを作るだけで、送信は利用者に委ねる。
5. **検証は採用ではない。** `validate-*`はレビュー用の受領書を返すだけで、記法・Candidate選択・変換案を自動適用しない。`inspect`は既定で構造だけを返し、値は明示指定時だけ返す。
6. **プロトコル版を固定して記録する。** 初版は`2024-11-05`を返し、クライアントの要求版との交渉結果を`_meta`に残す。新しいプロトコル版へ上げる場合は、このADRを見直す。
7. **書き込みを公開する場合は別ADRを要する。** 将来、MCPから抽出・取り込みを許す場合は、権限・確認・監査・ロールバックの契約を新しいADRで定める。

## Consequences

- **Good:** AIエージェントは原本を丸読みせずに、目録・参照・check・render・handoff・検証まで進められる。MCP経由で原本・台帳・成果物が変わることはなく、CLIと同じ結果が返る。利用者はAIに読ませる範囲を`--root`で制限できる。MCPの追加が既存の権威経路を変えない。
- **Bad:** AIエージェントだけでは抽出・取り込み・実体化を完結できない。採用操作はCLI/VS Codeへ戻す必要がある。MCPのプロトコル版が古くなると、新しいクライアント機能を使えない。読み取り専用でも、`inspect --values`で値を返す場合は、利用者が範囲と目的を確認する必要がある。
- **Traceability:** 実装は`src/cli/mcp.ts`、`scripts/build-cli-package.mjs`、`scripts/verify-cli-package.mjs`。試験は`test/mcpServer.test.ts`、`test/mcpParity.test.ts`、`test/cliDistribution.test.mjs`。利用文書は`04_Documentation/mcp-server.md`。

## Traceability

- Related Issues: [#527](https://github.com/hat47x/markdown-matrix-injector/issues/527)
- Related Docs: [MCPサーバ](../04_Documentation/mcp-server.md)、[Semantic Candidate契約 v1](../../02_Architecture/candidate-contract-v1.md)
