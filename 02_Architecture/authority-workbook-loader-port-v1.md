# Authority Workbook Loader Port v1

## 1. 目的

Authority adapterのpreviewを、任意のpreloaded WorkbookDataだけでなく、**containment済みsource pathから実際にloadしたWorkbookData**へ結び付ける。

production loaderの実装は変更せず、experimental側から薄く接続する。

## 2. Port

```ts
type AuthorityWorkbookLoader =
  (absolutePath: string) => WorkbookData
```

adapterがloaderへ渡すpathは必ず:

1. Notation parser成功
2. `resolveSourcePath` 成功
3. workspace containment成功

後のものに限定する。

loaderがsource path解決やcontainmentを独自に行う構造にはしない。

## 3. Preloaded Workbookとの排他

issue-0145互換のため `workbook?: WorkbookData` は残す。

ただしは次のとおりです。

```text
workbook + workbookLoader
```

の同時指定は曖昧なため拒否する。

- preloaded workbook: 実験・既存test用
- workbookLoader: source identityとload経路を結び付ける推奨経路

と位置付ける。

## 4. Source snapshot consistency

loader経路では:

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

を比較する。

before != afterの場合。

```text
source-identity = failed
evidenceCode = SOURCE_CHANGED_DURING_PREVIEW
```

とする。

preview自体が成功していてもReceipt全体はblockedになる。

これはsource of truthをlockする仕組みではなく、観測中の変化を検出して安全側へ倒す境界である。

## 5. Loader failure

loader例外はReceipt生成を中断しない。

```text
preview = failed
PREVIEW_WORKBOOK_LOAD_FAILED
```

として保持する。

loaderが呼ばれた後は、例外時でも可能な限りpost-load digestを確認する。

## 6. Explicit card

`mode=card` は既存Smart FallbackでWorkbook load前に確定する。

この場合loaderを呼ばない。

source identity / existence / containmentは通常どおり検証する。

## 7. Production bridge

`runExecutableProposalAuthorityEvidenceWithDefaultLoader` はdynamic importで既存:

```ts
loadWorkbook({ absolutePath })
```

へ接続する。

dynamic importにする理由は:

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

TOCTOUを完全に排除するのではなく、通常のload/preview窓でsource変更を検出してAuthority Evidenceをblockedにする。
