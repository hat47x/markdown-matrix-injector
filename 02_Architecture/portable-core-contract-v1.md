# Portable Core Contract v1

## 目的

MMIのCore（処理本体）を、VS CodeやNode.js固有のファイルシステム処理から分離し、将来のGo/TinyGo/WASM実装とも比較できるように、責務と入出力の境界を定める。

v1で対象とする最小の操作範囲（縦切り）は`inspect`のみである。対象のSource Adapter（入力形式を候補へ変換する部品）は、CSV / XLSX / XLSM / XML Spreadsheet 2003の表Candidateと、JSON / 汎用XMLの明示Tree Candidateを扱う。画像、Shape、provider-dependent認知、`check` / `render` / `extract`は後続の契約拡張とする。

本書は「Goへの移行」を決定するものではない。同じ入出力契約とconformance corpus（適合性を照合する共通の検証ケース群）に基づいて、異なる実装を比較するための基準を示す。

## 境界

### Hostが持つ責務

Host（実行環境とCoreをつなぐ側）は、その環境に固有のI/O（ファイルなどの入出力）を担当する。

- source fileを読み、bytesを取得する。
- workspace boundaryや利用者権限を管理する。
- requestをJSONとしてCoreへ渡す。
- responseをCLI、VS Code、Web等のUIへ写像する。
- 出力ファイルの作成や外部provider呼出しが必要な場合は、Coreとは別の明示経路で行う。

Portable Core v1自身はsource path（元ファイルの場所）を探索・読み込みしない。

### Coreが持つ責務

Coreはrequest（入力要求）に含まれるbytes（ファイルのバイト列）と設定のみから、deterministic（同じ入力に対して結果が定まる）に応答を生成する。

- source bytesのSHA-256を計算する。
- formatを`source.name`の拡張子から選ぶ。
- Source Adapterを実行する。
- Candidate / SourceLocator / provenance / fingerprintを返す。
- provider-dependent処理を実行しない。
- source、workspace、ネットワークへ書き込まない。

`source.label`はCandidate locator（候補の参照先を示す情報）へそのまま引き継ぐ論理名であり、Coreがfilesystem path（実際のファイル位置）として解決する値ではない。

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

Candidateの内部構造には既存のCandidate contract v1をそのまま用いる。provider score（提供元が返す評価値）を統合したtop-level confidence（応答全体の確信度）などは追加しない。`.xml`はbytesの内容で分岐し、XML Spreadsheet 2003は`format: "xml-spreadsheet"`、その他の汎用XMLは`format: "xml"`とする。汎用XMLは通常のTree Adapterと同じくUTF-8・DTD拒否・namespace検証の境界を使う。

## Strictness

v1のrequestはfail-closed（条件を満たさない入力を推測で通さず拒否する）として解釈する。

- 未知fieldを受け入れない。
- base64はcanonical representationだけを受け入れる。
- `maxScanCells`は正のsafe integerだけを受け入れる。
- `allowProviderDependent: true`を拒否する。
- 未対応拡張子を拒否する。
- requestに含まれないsourceを探索しない。

空のbytes自体は有効な入力であり、空CSVはCandidateが0件の結果として扱える。

CSVのレコード位置はsource coordinate（原本上の位置）として保持する。先頭の空レコードを除去して行番号を詰めてはならない。通常の末尾改行は直前のレコードの終端として扱い、それだけで新しい空レコードは作らない。この座標契約はTypeScript参照実装と標準Go実装で一致させる。

## 参照実装

TypeScript側では次を参照実装とする。

- contract: `src/application/portableCoreContract.ts`
- Node reference implementation: `src/application/portableCoreProtocol.ts`
- process boundary: `mmi core <request.json|->`

TypeScript参照実装には、現時点で`node:crypto`やSheetJS等への依存がある。したがってruntime（実行環境）自体の移植性を証明するものではない。portable（環境間で共通化する）とする対象は、JSON contractとHost/Coreの責務境界である。

## Conformance corpus

`test/fixtures/portable-core-v1/`に、source bytesを内包するrequestと期待条件を置く。

初期corpus:

- CSV table Candidate
- 先頭空レコードを含むCSV table Candidate（source coordinate保持）
- JSON Tree Candidate
- 汎用XML Tree Candidate（qualified name / namespace attribute / sibling ordinalを含む）
- test内で生成するXLSX table Candidate

TypeScript参照実装では、生成XLSXのCandidate列が既存`tableCandidates()`直呼びと完全一致することに加え、汎用XMLでもportable経路と`readXmlTree()`直呼びのCandidate列が一致することを確認する。XML corpusはClaim列・provenance version・subtree fingerprint digestまで固定し、namespace付きfixtureではprefixを含むqualified nameとnamespace declaration属性も共有契約にする。XML Spreadsheet 2003は従来どおり表経路に残す。これによりportable境界を追加したこと自体でCandidate意味論が分岐しないようにする。

将来の標準Go / TinyGo / WASM実装も、同じcorpusを入力としてCandidate、locator、provenance（出所情報）、fingerprint（内容を識別する情報）を比較する。binary size（実行ファイルのサイズ）やstartup（起動時間）が小さくても、conformance（契約への適合性）が損なわれる実装は採用しない。

## provider-dependent処理

v1はdeterministic-only（providerに依存しない決定的な処理のみ）とする。

provider-dependent（提供元のモデルや実行環境に依存する）認知処理は、Core契約を曖昧に拡張せず、少なくとも次を明示できる別profileまたは後続schemaで扱う。

- provider / model / artifact version
- parameters
- input digest
- network / local runtimeの要否
- artifact size

Coreのbinary sizeと、認知model/profileのartifact size（モデルや設定などの成果物の大きさ）は、別々に計測する。

## 次の拡張順

1. v1 `inspect`のTypeScript conformanceを固定する。
2. 標準GoでCSV tableとJSON / 汎用XML Treeの同一responseを段階的に実装する。
3. XLSX tableのdecode境界を評価する。
4. TinyGo native / WASMで同じcorpusを実行する。
5. size / cold start / memory /互換性を比較する。
6. その後に`check` / `render` / `extract`を同じApplication contractへ移す。
7. CLIとVS Codeのhost adapterを同じApplication APIへ収束させる。

実行ファイルのサイズを理由に、Candidate契約やAuthority semantics（権限・検証に関わる意味）を弱めない。
