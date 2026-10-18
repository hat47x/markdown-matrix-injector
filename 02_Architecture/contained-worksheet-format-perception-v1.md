# Contained Worksheet Format Perception v1

## 1. 目的

実source（実際の参照元ファイル）からFly-inspired Perception（ハエの嗅覚系に着想を得た特徴照合による候補抽出）までのprovenance chain（入力と結果の由来を追跡する経路）を一つにまとめる。

```text
source path context
      |
      v
approved Format Profiles -> matcher prototypes
      |
      v
Contained Cognitive Observation
  - resolve/containment
  - source identity before
  - snapshot reader
  - source identity after
      |
      v
WorksheetFormatSnapshot
      |
      v
existing worksheet matcher
      |
      v
Fly Perception adapter
```

## 2. Reader port

```ts
type WorksheetFormatSnapshotReader =
  (absolutePath: string, sheetName?: string) => XlsxFormatSnapshotResult
```

reader（ワークシート情報の読み取り処理）自身はcontained path（許可範囲内にあると確認されたパス）の解決を行わない。
workflow（処理の流れ）がcontainment（許可範囲内であることの確認）を終えたabsolute path（絶対パス）だけを渡す。

これにより、injected reader（呼び出し側から渡す読み取り処理）を使ったdependency-free test（実際の読み取りライブラリに依存しない試験）と、default reader（既定の読み取り処理）を使う既存SheetJS実装を、同じworkflowで扱える。

## 3. Observation payload

Observation payload（観測の内容）には、 `kind = worksheet-format` と `sheetName` だけを含める。

次の情報は含めない。

- cells
- merges
- feature list
- absolute source path
- raw file bytes

snapshot（読み取ったワークシートの一時データ）はstable read window（参照元の読み取り前後で同一性を確認する区間）内で取得し、一時値としてmatcher（書式の照合処理）へ渡す。

## 4. Provenance

Observation provenance（観測の出所情報）には、次の値を持たせる。

- sourceKind: callerが明示
- sourceDigest: canonical source-file-bytes-v1
- featureVersion: worksheet-format-v6
- sourceProfileId: current source profile id

Fly adapter（照合結果を認知結果へ変換する接続部）は、既存どおりfeatureVersion / sourceProfileId（特徴定義の版と参照元プロファイル）の互換性を再検証する。

## 5. Profile gating

readerを実行する前に、すべてのFormat Profile（書式プロファイル）を `formatProfileToWorksheetPrototype`（照合用prototypeへ変換する処理）へ通す。
candidate（承認前）のProfileや、互換性のないfeature/source profileは、source I/O（参照元ファイルへの入出力）より前に拒否される。

## 6. Classification semantics

本workflowはscore（評価値）やthreshold（判定しきい値）を変更しない。
matched / ambiguous / novel（一致・曖昧・新規の分類）は、既存matcherとPerception adapterが返した結果をそのまま引き継ぐ。

## 7. Source stability

snapshot readerは、issue-0153で定めたpayload reader（観測の内容を読み取る処理）として実行する。
read（読み取り）の前後でsource identity（参照元の同一性）が異なる場合は、ObservationもPerceptionも返さない。

## 8. Default reader

async default API（非同期の既定呼び出し口）は、dynamic import（必要な時点でモジュールを読み込む方式）で既存の `readXlsxFormatSnapshot` を呼ぶ。
snapshot reader本体、SheetJS bridge（SheetJSとの接続部）、fixture（試験用データ）は変更しない。

## 9. Snapshot shape

`WorksheetFormatSnapshot.merges` はoptional（任意項目）である。
reader port（読み取り処理の接続口）のshape validation（結果の構造検証）は `cells` を必須とし、`merges` は存在する場合にだけarray（配列）であることを要求する。

## 10. 非責務

- Format Profile approval
- production Profile store
- Judgment provider
- review envelope生成
- source write
- XLSX reader改修
- matcher tuning
- fill telemetry研究
