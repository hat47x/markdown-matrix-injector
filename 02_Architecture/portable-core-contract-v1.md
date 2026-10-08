# Portable Core Contract v1

## 目的

MMIのCoreを、VS Code、Node.jsのファイルシステム、将来のGo/TinyGo/WASMと切り離して比較できる境界を定める。

v1の最小縦切りは`inspect`だけを対象とする。対象Source Adapterは、CSV / XLSX / XLSM / XML Spreadsheet 2003の表Candidateと、JSON / 汎用XMLの明示Tree Candidateである。画像、Shape、provider-dependent認知、`check` / `render` / `extract`は後続の契約拡張とする。

この文書は「Goへ移行する」と決めるものではない。同じ入出力契約とconformance corpusを満たす実装を比較するための基準である。

## 境界

### Hostが持つ責務

Hostは実行環境固有のI/Oを担当する。

- source fileを読み、bytesを取得する。
- workspace boundaryや利用者権限を管理する。
- requestをJSONとしてCoreへ渡す。
- responseをCLI、VS Code、Web等のUIへ写像する。
- 出力ファイルの作成や外部provider呼出しが必要な場合は、Coreとは別の明示経路で行う。

Portable Core v1はsource pathを自分で探索・読込しない。

### Coreが持つ責務

Coreはrequestに含まれるbytesと設定だけからdeterministicに結果を返す。

- source bytesのSHA-256を計算する。
- formatを`source.name`の拡張子から選ぶ。
- Source Adapterを実行する。
- Candidate / SourceLocator / provenance / fingerprintを返す。
- provider-dependent処理を実行しない。
- source、workspace、ネットワークへ書き込まない。

`source.label`はCandidate locatorへそのまま保持する論理名であり、Coreがfilesystem pathとして解決する値ではない。

## JSON protocol

request schema:

```json
{
  "schema": "mmi.portable-core-request/v1",
  "operation": "inspect",
  "source": {
    "name": "design.xlsx",
    "label": "./design.xlsx",
    "bytesBase64": "..."
  },
  "options": {
    "maxScanCells": 200000
  },
  "executionPolicy": {
    "allowProviderDependent": false
  }
}
```

response schema:

```json
{
  "schema": "mmi.portable-core-response/v1",
  "operation": "inspect",
  "execution": "deterministic",
  "source": {
    "name": "design.xlsx",
    "label": "./design.xlsx",
    "format": "xlsx",
    "digest": "sha256:...",
    "byteLength": 12345
  },
  "candidates": [],
  "diagnostics": []
}
```

Candidateの内部構造はCandidate contract v1をそのまま使う。provider scoreを統合したtop-level confidence等は追加しない。`.xml`はbytesの内容で分岐し、XML Spreadsheet 2003は`format: "xml-spreadsheet"`、その他の汎用XMLは`format: "xml"`とする。汎用XMLは通常のTree Adapterと同じくUTF-8・DTD拒否・namespace検証の境界を使う。

## Strictness

v1 requestはfail-closedで解釈する。

- 未知fieldを受け入れない。
- base64はcanonical representationだけを受け入れる。
- `maxScanCells`は正のsafe integerだけを受け入れる。
- `allowProviderDependent: true`を拒否する。
- 未対応拡張子を拒否する。
- requestに含まれないsourceを探索しない。

空のbytes自体は有効である。空CSVはCandidate 0件として扱える。

CSVのレコード位置はsource coordinateとして保持する。先頭空レコードを除去して行番号を詰めてはならない。通常の末尾改行は直前レコードの終端であり、それだけでは新しい空レコードを作らない。この座標契約はTypeScript参照実装と標準Go実装で一致させる。

## 参照実装

TypeScript側では次を参照実装とする。

- contract: `src/application/portableCoreContract.ts`
- Node reference implementation: `src/application/portableCoreProtocol.ts`
- process boundary: `mmi core <request.json|->`

TypeScriptの参照実装は現時点で`node:crypto`、SheetJS等を利用する。これはruntimeがportableであることを意味しない。portableなのはJSON contractとhost/Core責務の境界である。

## Conformance corpus

`test/fixtures/portable-core-v1/`に、source bytesを内包するrequestと期待条件を置く。

初期corpus:

- CSV table Candidate
- 先頭空レコードを含むCSV table Candidate（source coordinate保持）
- JSON Tree Candidate
- 汎用XML Tree Candidate（qualified name / namespace attribute / sibling ordinalを含む）
- test内で生成するXLSX table Candidate

TypeScript参照実装では、生成XLSXのCandidate列が既存`tableCandidates()`直呼びと完全一致することに加え、汎用XMLでもportable経路と`readXmlTree()`直呼びのCandidate列が一致することを確認する。XML corpusはClaim列・provenance version・subtree fingerprint digestまで固定し、namespace付きfixtureではprefixを含むqualified nameとnamespace declaration属性も共有契約にする。XML Spreadsheet 2003は従来どおり表経路に残す。これによりportable境界を追加したこと自体でCandidate意味論が分岐しないようにする。

将来の標準Go / TinyGo / WASM実装は、同じcorpusを入力し、Candidate、locator、provenance、fingerprintを比較する。binary sizeやstartupが小さくてもconformanceが崩れる実装は採用しない。

## provider-dependent処理

v1はdeterministic-onlyとする。

provider-dependent認知は、Core契約を曖昧に拡張せず、少なくとも次を明示できる別profileまたは後続schemaで扱う。

- provider / model / artifact version
- parameters
- input digest
- network / local runtimeの要否
- artifact size

Core binary sizeと認知model/profile artifact sizeは別に測る。

## 次の拡張順

1. v1 `inspect`のTypeScript conformanceを固定する。
2. 標準GoでCSV tableとJSON / 汎用XML Treeの同一responseを段階的に実装する。
3. XLSX tableのdecode境界を評価する。
4. TinyGo native / WASMで同じcorpusを実行する。
5. size / cold start / memory /互換性を比較する。
6. その後に`check` / `render` / `extract`を同じApplication contractへ移す。
7. CLIとVS Codeのhost adapterを同じApplication APIへ収束させる。

サイズを理由にCandidate契約やAuthority semanticsを弱めない。
