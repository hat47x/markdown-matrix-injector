# MCPサーバで読み取りと検証を提供する

MMIは、利用者が選んだAIエージェントから読み取り・検証の操作を呼べるMCP（Model Context Protocol）サーバをstdioで提供します。サーバ名は`mmi-mcp`です。CLIと同じApplication層の関数を呼び、原本・台帳（ledger）・成果物を書き換えません。MMIから外部のLLMやネットワークへ送信する処理も持ちません。

この文書は実装済みの範囲を説明します。実際のAIエージェントからの接続と、基本設計書キットを使った価値の確認は未実施です（[#527](https://github.com/hat47x/markdown-matrix-injector/issues/527)）。

## 起動する

開発用チェックアウトでは、`03_Implement`で次を実行します。

```sh
npm run mcp -- --root .
```

`npm run`はパッケージ名などの見出し行をstdoutへ出すため、この形をMCPクライアントの起動コマンドには使わないでください。クライアントには`mmi-mcp`、または下に示す`node --import tsx src/cli/mcp.ts`を使ってください。

配布版のCLI tarballを導入した環境では、`mmi-mcp`を使います。

```sh
mmi-mcp --root /path/to/workspace
```

`--root`はワークスペースの境界です。省略すると起動時のカレントディレクトリになります。rootの外にあるパス、`..`による脱出、rootの外を指すsymlinkやjunctionは拒否します。

`mmi-mcp --help`と`mmi-mcp --version`は、MCPの通信を始める前に結果を表示して終了します。

## クライアントの設定例

MCP対応クライアントには、コマンドと引数を次の形で登録します。パスは環境に合わせて変えてください。

```json
{
  "mcpServers": {
    "mmi": {
      "command": "mmi-mcp",
      "args": ["--root", "D:/work/design-docs"]
    }
  }
}
```

開発用チェックアウトを直接使う場合は、`03_Implement`をカレントディレクトリにして次のように指定できます。

```json
{
  "mcpServers": {
    "mmi": {
      "command": "node",
      "args": ["--import", "tsx", "src/cli/mcp.ts", "--root", "."]
    }
  }
}
```

クライアントが`initialize`で別の`protocolVersion`を送っても、サーバは`2024-11-05`を返します。交渉結果は結果の`_meta["mmi/protocolNegotiation"]`に`requested`・`selected`・`compatible`として明示します。

## 提供するツール

| ツール | 主な引数 | 対応するCLI |
| --- | --- | --- |
| `schema` | `contract`（`candidate`・`ledger`・`review-decisions`） | `mmi schema <contract>` |
| `inspect` | `source`、`values`、`from`、`ledger`、`unimported`、`excludeImported` | `mmi inspect --json` |
| `check` | `paths`（ファイルまたはディレクトリの配列） | `mmi check --json` |
| `render` | `document`、`to`（`md`または`html`） | `mmi render` |
| `select` | `source`、`table`または`candidate`、`sheet`、`columns`、`contains`、`in`、`first`、`from` | `mmi select --json` |
| `find` | `query`、`from` | `mmi find --json` |
| `handoff` | `source`、`task`、`document`、`includeValues` | `mmi handoff --json` |
| `validate-proposal` | `notation`、`package`、`document` | `mmi validate-proposal --json` |
| `validate-selection` | `proposal`（パスまたはJSON object）、`package` | `mmi validate-selection --json` |
| `validate-transformation` | `proposal`（パスまたはJSON object）、`package`、`document` | `mmi validate-transformation --json` |

`inspect`は既定で構造だけを返します。セルの値が必要なときだけ`values`へ行数を指定します。これはCLIの`--values`と同じで、既定では値を含めません。

`handoff`はCLIの`--json`と同じhandoff packageを返します。CLIの既定出力であるprompt文字列は返しません。promptが必要な場合は、返されたpackageをクライアント側で扱うか、CLIの`mmi handoff`を使ってください。

`validate-selection`と`validate-transformation`の`proposal`は、ワークスペース内のJSONファイルのパスか、クライアントが組み立てたJSON objectを受け取ります。サーバは提案を保存しません。

## プロトコル

- JSON-RPC 2.0をstdioで扱います。1行に1つのJSONメッセージを置き、Content-Length形式のフレーミングは使いません。
- `initialize`、`notifications/initialized`、`tools/list`、`tools/call`、`ping`に対応します。
- 未知のメソッドは`-32601`、不正なJSONは`-32700`、不正なリクエストは`-32600`、未知のツールや引数の型不正は`-32602`を返します。
- 1メッセージの上限は8 MiBです。超えた行は`-32600`で拒否し、後続のメッセージは処理を続けます。巨大な入力や不正なJSONでサーバは終了しません。
- `check`のエラー、`validate-*`の不受理、`select`・`find`の該当なしは、通信の失敗ではなくツール結果として返します。`tools/call`の`isError`が`true`になるのは、ファイル不在・境界外・解析失敗などツールを実行できなかった場合です。

## 読み取り専用の境界

- `extract`・`import`・`materialize`・`html-commit`など、書き込みを伴う操作は公開しません。
- サーバ自身は、原本・ledger・成果物・設定ファイルを書き換えません。`inspect`がledgerを参照する場合も読み取りだけです。
- パスは起動時の`--root`を境界に解決します。root外の絶対パス、`..`による脱出、root外を指すsymlink・junctionを拒否します。
- ネットワークへ接続しません。通信はクライアントとのstdin/stdoutだけです。

## CLIとの一致

次の操作は、同じ入力に対してCLIのJSONまたはテキストと同じ結果になることを回帰テスト（`test/mcpParity.test.ts`）で固定しています。

- `inspect`と`mmi inspect --json`
- `check`と`mmi check --json`
- `render`と`mmi render`（CLIが付ける末尾の改行を除いて同一）
- `schema`と`mmi schema`
- `select`と`mmi select --json`
- `find`と`mmi find --json`
- `handoff`と`mmi handoff --json`

テストは基本設計書キット（`04_Documentation/kits/basic-design`）を使います。比較のため、MCPサーバのパス表示は起動時のrootを基準にします。

## 制限と未確認事項

- stdio transportだけを提供します。HTTPやWebSocketは提供しません。
- 1プロセスにつき1つのworkspace rootです。複数のrootを切り替える場合は、クライアント側でrootごとにサーバを起動します。
- 書き込み系の操作をMCPへ加えるかは、初版の利用を見てから判断します（#527のRemaining work）。
- 実際のMCPクライアント（AIエージェント）からの接続、基本設計書キットでの目録・参照・check・報告の一巡は未実施です。
- Windowsでの配布tarballのMCP smokeは`npm run package:cli`の検証に含めますが、macOSとNode 20での確認は未実施です。

## 検証

```sh
cd 03_Implement
node --import tsx --test ./test/mcpServer.test.ts ./test/mcpParity.test.ts
npm run package:cli
```
