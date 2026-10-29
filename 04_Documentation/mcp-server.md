# MCPサーバで読み取りと検証を提供する

MMIは、利用者が選んだAIエージェントから読み取り・検証の操作を呼べるMCP（Model Context Protocol）サーバをstdioで提供します。起動コマンドは`mmi-mcp`で、`initialize`が返す`serverInfo.name`は`markdown-matrix-injector`です。CLIと同じApplication層の関数を呼び、原本・台帳（ledger）・成果物を書き換えません。MMIから外部のLLMやネットワークへ送信する処理も持ちません。

この文書は実装済みの範囲を説明します。実際のAIエージェントからの接続と、基本設計書キットを使った価値の確認は未実施です（[#527](https://github.com/hat47x/markdown-matrix-injector/issues/527)）。読み取り専用にする設計判断は[ADR-0027](../01_Plans/adr/ADR-0027-read-only-mcp-agent-boundary.md)に記録しています。

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

`mmi-mcp`の入口は`dist/src/cli/mcp-bootstrap.js`です。Node.js 20未満で起動すると、SheetJS等の依存を読み込む前に、必要な版と現在の版を標準エラーへ出し、終了コード2で終わります。標準出力へは何も書きません。この版判定は`mmi`の入口（`bootstrap.js`）と同じ関数を使います。Node.js 18での実機の失敗内容は未確認で、偽の版番号を渡す単体テストで確認しています。

`mmi-mcp --help`と`mmi-mcp --version`は、MCPの通信を始める前に結果を表示して終了します。`--version --json`は、次の「応答するビルドの識別」と同じ内容を1行のJSONで表示します。

## 応答するビルドの識別

接続側は、どのビルドに対して応答を得たかを`initialize`の結果から確かめられます。`result._meta["mmi/buildIdentity"]`が`mmi.build-identity/v1`を返します。`mmi --version --json`と`mmi-mcp --version --json`も同じ形です。

| 項目 | 内容 |
| --- | --- |
| 版（`version`） | `package.json`の版。コミットごとには上がらないため、版番号だけではコミットを特定できません。 |
| コミット（`commit`） | ビルド元のコミットSHA（40桁）。配布tarballは作成時のgit HEADを埋め込み、開発用チェックアウトは起動時の`git rev-parse HEAD`で求めます。取れないときは`null`です。チェックアウトでは未コミットの変更を反映しないため、`dirty`と合わせて読みます。 |
| lockfile digest（`lockfileDigest`） | `package-lock.json`の生バイト列のsha256（`sha256:<hex>`）。tarballは作成元のlockfileの値を埋め込みます。改行をCRLFへ変換したチェックアウトでは値が変わります。 |
| 未コミットの変更（`dirty`） | ビルド元に未コミットの変更があるか（`true`/`false`）。追跡対象外のファイルも数え、リリース証跡（`release-evidence.json`）と同じく`git status --porcelain`が空でないかで判定します。チェックアウトは起動時に求め、tarballは作成時の値を埋め込みます。gitがない・3秒で終わらない・この項目を持たない旧tarballでは`null`で、`false`と推測しません。`commit`を版固定の証拠にするときは、`dirty: false`も確かめてください。 |
| Node.js（`node`） | 応答しているNode.jsの`version`と`major`。 |
| 提供形態（`distribution`） | `tarball`（配布tarball）、`checkout`（開発用チェックアウト）、`unknown`。 |

`serverInfo`は標準の`name`と`version`だけを返し、独自項目は`_meta`に置いています。Node.jsの対応版は`package.json`の`engines.node`（20以上）です。CIでの試験はNode.js 22です。

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
| `inspect` | `source`、`values`、`from`、`ledger`、`unimported`、`excludeImported`、任意`expectedSourceDigest` | `mmi inspect --json` |
| `html-audit` | `source`、`plan`、任意`ledger` | `mmi html-audit --json`（静的HTML分割後の監査のみ） |
| `check` | `paths`（ファイルまたはディレクトリの配列） | `mmi check --json` |
| `render` | `document`、`to`（`md`または`html`） | `mmi render` |
| `select` | `source`、`table`または`candidate`、`sheet`、`columns`、`contains`、`in`、`first`、`from`、任意`expectedSourceDigest` | `mmi select --json` |
| `find` | `query`、`from` | `mmi find --json` |
| `handoff` | `source`、`task`、`document`、`includeValues` | `mmi handoff --json` |
| `validate-proposal` | `notation`、`package`、`document` | `mmi validate-proposal --json` |
| `validate-selection` | `proposal`（パスまたはJSON object）、`package` | `mmi validate-selection --json` |
| `validate-transformation` | `proposal`（パスまたはJSON object）、`package`、`document` | `mmi validate-transformation --json` |

すべてのツールは、`tools/list`の`inputSchema.properties`にない引数名を`-32602`で拒否します。メッセージには未知の引数名と、受け付ける引数名の一覧を含めます。綴りを誤った`expectedSourceDigest`が黙って無視され、版を固定しないまま成功することを防ぐためです。将来の引数を先行して付ける接続側は、`tools/list`で宣言を確かめてから呼び出してください。

`select`の`columns`と`in`は、原本の列記号（A、Cなど）ではなく、表の見出し名を受け取ります。`columns`は見出し名のカンマ区切り（例: `機能ID,機能名`）、`in`は`contains`を適用する見出し名1つで、`columns`で表示する列のいずれかでなければなりません。列記号を渡すと`COLUMN_NOT_FOUND`で失敗します。記法の`columns=A,C,F`が列記号を使うのとは別で、`mmi select --columns`・`--in`と同じ規則です。

`select`と`find`の結果は、対象原本の`sourceDigest`を返します。`select`は結果の最上位（`candidate`と同じ階層）、`find`は各候補です。値は`inspect`が各Candidateの`locator.sourceDigest`で返すものと同じで、原本のbytesから取ります。選択結果がどの版の原本に対するものかを、この値で照合できます。`mmi.selection/v0`の本体は変えず、項目を足しただけなので、既存の読み手はそのまま使えます。`handoff`など他のツールの結果には付けていません。

`inspect`と`select`は、任意の`expectedSourceDigest`（CLIでは`--expected-source-digest`）を受け取ります。原本のdigestが一致しなければ、原本を読む前に拒否します。`select`は`ok: false`・`SOURCE_DIGEST_MISMATCH`のツール結果で、実際のdigestを`sourceDigest`に添えて返します。`inspect`は`isError=true`のエラーです。`sha256:`と64桁の16進数でない値は、不一致ではなく引数の誤りとして`-32602`（CLIでは終了コード2）で拒否します。`find`は複数の原本を横断するため、この引数を持ちません。

`inspect`は既定で構造だけを返します。セルの値が必要なときだけ`values`へ行数を指定します。これはCLIの`--values`と同じで、既定では値を含めません。

`html-audit`は、既存の明示的な`html-commit`で使用したレビュー済みJSON計画を指定し、分割後の出力とLedgerを読み取り専用で再照合します。`complete/incomplete/stale/blocked`と各出力の診断を返します。`incomplete`はツール呼出しの失敗ではなく、有効な監査結果なので`isError=false`です。ワークスペース外のパス、不正な計画、解析不能なファイルはエラーとして扱います。保存用`html-commit`ツールは公開せず、`html-audit`に`commit`など未知の引数を渡した場合も拒否します。[CLIと手動確認手順](html-decomposition-audit.md)を参照してください。

`handoff`はCLIの`--json`と同じhandoff packageを返します。CLIの既定出力であるprompt文字列は返しません。promptが必要な場合は、返されたpackageをクライアント側で扱うか、CLIの`mmi handoff`を使ってください。

`validate-selection`と`validate-transformation`の`proposal`は、ワークスペース内のJSONファイルのパスか、クライアントが組み立てたJSON objectを受け取ります。サーバは提案を保存しません。

## プロトコル

- JSON-RPC 2.0をstdioで扱います。1行に1つのJSONメッセージを置き、Content-Length形式のフレーミングは使いません。
- `initialize`、`notifications/initialized`、`tools/list`、`tools/call`、`ping`に対応します。
- 未知のメソッドは`-32601`、不正なJSONは`-32700`、不正なリクエストは`-32600`、未知のツールや引数の型不正は`-32602`を返します。
- 1メッセージの上限は8 MiBです。超えた行は`-32600`で拒否し、後続のメッセージは処理を続けます。巨大な入力や不正なJSONでサーバは終了しません。
- `check`のエラー、`validate-*`の不受理、`select`・`find`の該当なしは、通信の失敗ではなくツール結果として返します。`tools/call`の`isError`が`true`になるのは、ファイル不在・境界外・解析失敗などツールを実行できなかった場合です。

## ツール失敗の理由コード

`isError`が`true`の応答には、失敗の種類を表す`code`を付けます。クライアントは、Node.jsの版やOSで変わる文言ではなく、この値で分岐してください。

```json
{
  "content": [{ "type": "text", "text": "mmi: Argument \"source\" is outside the MCP workspace root." }],
  "structuredContent": { "contract": "mmi.mcp-error/v1", "code": "outside-root", "message": "Argument \"source\" is outside the MCP workspace root." },
  "_meta": { "mmi/error": { "contract": "mmi.mcp-error/v1", "code": "outside-root", "message": "Argument \"source\" is outside the MCP workspace root." } },
  "isError": true
}
```

- `outside-root`: 引数のパスやワークスペース内のリンクが、`--root`の外を指している。
- `not-found`: 指定したファイルやディレクトリが存在しない。
- `parse-failed`: ファイルはあるが、読み取りまたは解析に失敗した（JSONの不正を含む）。
- `digest-mismatch`: 呼出し側が渡した`expectedSourceDigest`と、原本の現在のダイジェストが一致しない。
- `tool-failed`: 上記のどれにも当たらない、ツール実行中の失敗。

本サーバが使うプロトコル版2024-11-05に`structuredContent`の定義はありません。同じ内容を、基本プロトコルが拡張用に予約している`_meta`の`mmi/error`にも置きます。新しい版のクライアントは`structuredContent`、古い版のクライアントは`_meta`を読めます。`text`は従来どおり`mmi: <メッセージ>`です。

- `message`と`text`には、ホストの絶対パスを含めません。`--root`の下のパスはroot相対で示し、それ以外の絶対パスは`<path>`に置き換えます。
- `code`の名前は`mmi.cli/v0`の診断コード（`MMI_*`）とは別の体系です。診断コードは文書の記法の問題、`code`はツールを実行できなかった理由を表します。成功した応答に`structuredContent`は付きません。
- `code`の値を増やすことは、互換性を保つ変更として扱います。未知の`code`は`tool-failed`と同じに扱ってください。

## 読み取り専用の境界

- `extract`・`import`・`materialize`・`html-commit`など、書き込みを伴う操作は公開しません。
- サーバ自身は、原本・ledger・成果物・設定ファイルを書き換えません。`inspect`がledgerを参照する場合も読み取りだけです。
- パスは起動時の`--root`を境界に解決します。root外の絶対パス、`..`による脱出、root外を指すsymlink・junctionを拒否します。
- ネットワークへ接続しません。通信はクライアントとのstdin/stdoutだけです。

この性質は`test/mcpReadOnly.test.ts`が固定します。基本設計書キット（xlsx）を一時ディレクトリへ複製して`git init`しコミットしたうえで、`MCP_TOOL_NAMES`の全ツール（`render`は`md`と`html`の両方）を呼びます。呼出しの前後で、`.git`を含む全ファイルの相対パス・サイズ・更新時刻・内容のSHA-256が一致することを確かめます。`tools/list`に、抽出・取り込み・実体化・保存・削除を思わせる名前がないことも検査します。新しいツールを加えて、このテストが呼ばない場合は失敗します。

このテストが示さない範囲は次のとおりです。

- ファイルを開いて同じ内容で書き戻す（更新時刻も戻す）ような変更は、内容digestと名前一覧では検出できません。
- 外部のGit実行（`git diff`など）は、このサーバが呼ばないため対象外です。呼び出し側が`.git/index`を書き換える場合は、呼び出し側で扱ってください。
- Windowsでの更新時刻の粒度は、CI（Linux・Windows）で確かめた範囲に限ります。

## CLIとの一致

次の操作は、同じ入力に対してCLIのJSONまたはテキストと同じ結果になることを回帰テスト（`test/mcpParity.test.ts`）で固定しています。

- `inspect`と`mmi inspect --json`
- `check`と`mmi check --json`
- `render`と`mmi render`（CLIが付ける末尾の改行を除いて同一）
- `schema`と`mmi schema`
- `select`と`mmi select --json`
- `find`と`mmi find --json`
- `select`・`find`が返す`sourceDigest`と、`expectedSourceDigest`の一致・不一致の扱い
- `handoff`と`mmi handoff --json`
- `html-audit`と`mmi html-audit --json`（専用fixture。正常・欠落・原本更新時のread-onlyパリティ）

テストは基本設計書キット（`04_Documentation/kits/basic-design`）を使います。比較のため、MCPサーバのパス表示は起動時のrootを基準にします。

## 制限と未確認事項

- stdio transportだけを提供します。HTTPやWebSocketは提供しません。
- 1プロセスにつき1つのworkspace rootです。複数のrootを切り替える場合は、クライアント側でrootごとにサーバを起動します。
- 書き込み系の操作をMCPへ加えるかは、初版の利用を見てから判断します（#527のRemaining work）。
- 実際のMCPクライアント（AIエージェント）からの接続、基本設計書キットでの目録・参照・check・報告の一巡は未実施です。
- 配布tarballの導入と`mmi`・`mmi-mcp`のsmokeは`npm run package:cli`で検証します。PRではLinuxだけ、Windowsはmainへのpushと手動実行（`workflow_dispatch`）で実行します。macOSとNode 20での確認は未実施です。

## 検証

```sh
cd 03_Implement
node --import tsx --test ./test/mcpServer.test.ts ./test/mcpParity.test.ts
npm run package:cli
```
