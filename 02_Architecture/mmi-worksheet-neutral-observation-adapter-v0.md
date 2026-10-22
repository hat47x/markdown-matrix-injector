# MMI Worksheet -> Structured Artifact Neutral Observation Adapter v0

## 1. Position

本adapter（観測データを別の形式へ対応付ける部品）は、GitHub Issue #218のSAI-0/H2に関する研究専用である。

次の既存機構・契約を置き換えるものではない。
- WorksheetFormatSnapshot
- Format Profile
- Fly matcher
- review-route
- MMI Notation

neutral observation（比較用の中立な観測表現）は、元の情報を一部省略した投影であり、原本と同じ情報量を保持するものではない。

## 2. Source observation

入力には、既存の`WorksheetFormatSnapshot`（ワークシート書式の観測スナップショット）を用いる。

adapter自体はXLSXを直接読み込まず、ファイルシステムへのアクセス権限も拡張しない。

スナップショットの取得は、別の呼び出し側が既存のcontained XLSX経路（アクセス範囲を制限した読み込み経路）を通して行える。

## 3. Region

neutral region（中立表現での観測範囲）は、正規化したテキストが空でないセルを囲む最小の矩形とする。これは観測範囲の決め方であり、元のセルの存在判定を変更しない。

MMI内部の座標は0始まりである。
中立表現の座標は1始まりで、範囲の両端を含む。

書式のみが設定されたセルによって、観測範囲は拡張しない。

空でないテキストを持つセルが存在しない観測は、0×0の領域を仮に作るのではなく拒否する。

## 4. Features

### geometry.non_empty_ratio

```text
non-empty text cells
--------------------
slots in non-empty bounding rectangle
```

Method:
`mmi-snapshot-non-empty-bounds-v1`

MMIのスナップショットは行・列の非表示状態を保持しないため、この比率はnormalizer（比較先の正規化処理）が求める表示セル限定の比率とは算出方法が異なる。

### geometry.merged_cell_count

観測範囲と重なる結合セルの範囲を数える。

Method:
`mmi-snapshot-region-merge-count-v1`

### role.header_candidate_signal

`extractWorksheetFormatFeatures`（既存の書式特徴抽出処理）を再利用する。

Values:
- present
- absent

方式の識別情報には`WORKSHEET_FORMAT_FEATURE_VERSION`（書式特徴の契約版）を含める。

これは導出した候補信号であり、構造を確定したラベルではない。

## 5. Missing features

次の特徴は出力しない。
- border_closure
- grid_alignment
- merge_ambiguity
- topology_consistency
- repeated row/column signals
- body candidate

将来、実行可能なMMI観測によって根拠のある対応付けが示されるまでは、これらを補完して出力しない。

欠落は数値のゼロを意味しない。未観測と観測値ゼロを区別する。

## 6. Provenance digest

source observation digest（元の観測情報の識別用ハッシュ値）は、次の情報を正規化された順序・表現でハッシュ化する。
- producer schema marker
- sheet name
- sorted snapshot cells
- sorted merges

投影した中立特徴の数値が同じでも、書式やテキストの変更によってprovenance（出所と観測の由来を表す情報）が変わる場合がある。

## 7. Adapter config identity

静的なadapter設定のdigest（設定の識別用ハッシュ値）は、次の要素を結び付ける。
- adapter version
- non-empty method
- merge method
- worksheet format feature version used for header signal
- explicit absence of hidden row/column visibility

## 8. Cross-repo comparison

H2で比較する際には、次の差異・根拠を保持する。
- region disagreement
- method disagreement
- missing features
- producer provenance

adapterは、excel-normalizerの出力に合わせるためにMMIの観測結果を強制的に書き換えない。

## 9. Non-goals

- matching normalizer numeric values
- model training
- runtime schema extraction
- automatic label creation
- product confidence comparison
- production UI/routing
