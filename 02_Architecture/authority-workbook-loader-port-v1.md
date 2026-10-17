# Authority Workbook Loader Port v1

## 1. 目的

Authority adapter（既存のAuthority検証処理を呼び出す接続部）のpreview（表示候補を確認する処理）を、任意のpreloaded WorkbookData（事前に読み込んだブックのデータ）だけでなく、**containment済みsource pathから実際にloadしたWorkbookData**へ結び付ける。ここでいうcontainmentは、参照先のパスが許可されたワークスペース内に収まっていることの確認を指す。

production loader（既存の実運用向け読み込み処理）の実装は変更せず、experimental側（実験用の処理経路）から最小限の接続を行う。

## 2. Port

Portは、adapterがWorkbookの読み込み処理を呼び出すための接点である。型は次のとおりとする。

```ts
type AuthorityWorkbookLoader =
  (absolutePath: string) => WorkbookData
```

adapterがloader（Workbookの読み込みを担当する処理）へ渡すpathは、次の3つの確認を通過したものに限る。

1. Notation parser成功
2. `resolveSourcePath` 成功
3. workspace containment成功

loaderがsource pathの解決やcontainmentを独自に行う構造にはしない。

## 3. Preloaded Workbookとの排他

issue-0145との互換性を保つため、`workbook?: WorkbookData`（読み込み済みWorkbookを任意に渡す指定）は残す。

ただし、読み込み元が曖昧になるため、次の同時指定は拒否する。

```text
workbook + workbookLoader
```

各指定の用途は、次のように区別する。

- preloaded workbook: 実験・既存test用
- workbookLoader: source identityとload経路を結び付ける推奨経路

## 4. Source snapshot consistency

loader経路では、次の順に読み込み前後のdigest（原本の内容を照合するための値）を取得する。

```text
digest before load
      |
      v
Workbook loader
      |
      v
preview
      |
      v
digest after load
```

取得した2つのdigestを比較する。

読み込み前後で値が異なる場合（before != after）は、次の結果とする。

```text
source-identity = failed
evidenceCode = SOURCE_CHANGED_DURING_PREVIEW
```

preview自体が成功していても、Receipt（検証結果の記録）全体はblocked（条件を満たさず処理を進めない状態）になる。

これはsource of truth（正本）をlock（固定）する仕組みではない。観測中に正本が変化したことを検出し、安全側へ倒すための境界である。

## 5. Loader failure

loaderで例外（読み込み時のエラー）が発生しても、Receiptの生成は中断しない。その場合は、次の状態とevidence code（結果を識別する証拠コード）を記録する。

```text
preview = failed
PREVIEW_WORKBOOK_LOAD_FAILED
```

loaderが呼ばれた後は、例外時でも可能な限りpost-load digest（読み込み後に取得する照合値）を確認する。

## 6. Explicit card

`mode=card` は、既存のSmart Fallback（表示方法を選ぶ仕組み）により、Workbookを読み込む前に確定する。

この場合loaderを呼ばない。

source identity / existence / containmentは通常どおり検証する。

## 7. Production bridge

`runExecutableProposalAuthorityEvidenceWithDefaultLoader` は、dynamic import（必要な時点でモジュールを読み込む方法）によって、次の既存処理へ接続する。

```ts
loadWorkbook({ absolutePath })
```

dynamic importを使う理由は次のとおりである。

- experimental module importだけでXLSX runtimeを強制しない
- loader wiringを1箇所に限定する
- injected loader testを外部dependencyなしで行える

production `workbookLoader.ts` 自体は変更しない。

## 8. 非責務

- filesystem lock
- transactional snapshot
- Workbook loader内部の変更
- cache policy変更
- XLSX parser変更
- fill telemetry変更
- source mutation
- production UI wiring

TOCTOU（確認時点と利用時点の間に状態が変わる問題）を完全に排除するものではない。通常のload/previewの間にsourceの変更を検出し、Authority Evidenceをblockedにする。
