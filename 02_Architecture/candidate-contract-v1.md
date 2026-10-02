# Semantic Candidate 契約 v1

- 状態: 実装済み（型・不変条件・表と画像のSource Adapter・`mmi inspect --json`・`mmi extract`）。図形・木構造・メモ・リスト・見出しのAdapterは未実装。
- 関連: [ADR-0019](../01_Plans/adr/ADR-0019-ai-era-sier-document-value-and-policy.md) D4・D6・D8、[ADR-0018](../01_Plans/adr/ADR-0018-cognitive-assistance-plane.md) D1〜D5、[ADR-0020](../01_Plans/adr/ADR-0020-requirement-oriented-cognition-method-selection.md)、[issue-0193](../01_Plans/issues/issue-0193-candidate-source-adapter-contract.md)
- 実装: `src/core/candidate.ts`（型と不変条件）、`src/adapters/tableRegionAdapter.ts`（最初のAdapter）、`test/candidate.test.ts`

Candidateは、Source Adapterが見つけた「情報の単位」を、取り込み・参照・レビュー・台帳が共通に扱うための型である。入力形式とMarkdown出力を直接結ばず、Source Adapter → Observed Structure → Candidate → 確認／参照／取り込み、の順に流す（ADR-0019 D4）。

## 1. 直交する3つの軸

| 軸 | 値 | 意味 |
| --- | --- | --- |
| 認識論上の状態 | `observed` / `inferred` / `confirmed` / `abstained` | 何をどう知っているか。原本から読んだ、方式が導いた、人が決めた、方式が答えを控えた |
| 実行特性 | `deterministic` / `provider-dependent` | モデルやproviderなしで、同じ入力から同じ出力が再現できるか |
| method class | `M0`〜`M5`（ADR-0020） | 明示抽出、決定論的推定、軽量類似、bounded Judgment、local generative、外部handoff |

軸は互いに独立である。規則でも推定でき（`inferred + deterministic`）、モデルが原本の値を読むこともある（`observed + provider-dependent`）。1つのラベルに潰さない。

**状態は主張（Claim）ごとに持つ。** 表のセル座標は原本の矩形そのもの（`observed`・M0）だが、どこまでが1つの表かという境界、表題、見出しは規則から導いたもの（`inferred`・M1）である。Candidate全体の`status`は、候補が主張する中身（境界・同一性）の状態を表す。

## 2. 型の要点

```text
Candidate { kind, locator, status, execution, method, claims[], provenance, fingerprint, scores[], reference? }
Claim     { aspect, value?, status, execution, method, reasonCode, evidence[]? }
Provenance{ algorithm, run }
run       deterministic       { inputDigest, config, implementationVersion }
          provider-dependent  { inputDigest, provider, model, artifactVersion, parameters }
```

- `kind`はADR-0019 D4の種別（`table-range`・`image`・`region-snapshot`・`shape`・`diagram`・`tree`・`choice-list`・`note`・`link`・`section`）。Excelオブジェクト型と同一視しない。
- `locator`は原本パス、原本のsha256（SourceIdentity v1）、シート、A1範囲。
- `abstained`の主張は**値を持たない**。答えを控えた方式は何も主張しない。理由は`reasonCode`に残す。
- **providerごとの信頼度を共通の尺度に合成しない**（ADR-0018 D4）。`scores`は`provider`と`scale`で区別する一覧で、最上位に`confidence`は存在しない。同じproviderの同じ尺度は1件だけ。規則による方式は`scores`を持たない。
- 再現性は`run`で表す。決定論的な経路は「入力ダイジェスト＋設定＋実装版」で再現でき、provider依存の経路はprovider・model・artifact版・parametersを必ず残す。

`candidateProblem(candidate)`が次の不変条件を検査する（テストで各項目を確認）。

1. 主張が1つ以上ある。
2. `execution`が`provenance.run`と一致する。決定論的なCandidateにprovider依存の主張を入れない。
3. `observed`の主張はM0（明示抽出）に限る。
4. `abstained`の主張は値を持たず、それ以外は値を持つ。主張には必ず`reasonCode`がある。
5. 全主張が`abstained`のときに限り、Candidateが`abstained`である。
6. `locator.sourceDigest`はsha256で、`run.inputDigest`と一致する。
7. 決定論的な経路は`implementationVersion`を、provider依存の経路はprovider・model・artifactVersionを持つ。決定論的な規則方式に`scores`はない。同一provider・尺度のscoreの重複はない。

## 3. 最初のSource Adapter: 表の領域

`tableCandidates()`は、領域検出（`src/search/regionDetector.ts`）の結果を`table-range`のCandidateへ変換する純粋関数である。

| 主張 | 状態 | method | 根拠 |
| --- | --- | --- | --- |
| `location` | `observed` | M0 | 原本セルの物理座標（`source-cell-coordinates`） |
| `boundary` | `inferred` | M1 | 空行・空列による分割。理由は検出器の`reasons`をevidenceに写す |
| `title` | `inferred` | M1 | 表の上の孤立セル・結合セル、または密着した1行目 |
| `header` | `inferred`または`abstained` | M1 | 見出し規則を満たすときだけ値を主張。不確か（`header-uncertain`）や単一行（`no-header`）では答えを控える |

- 実行特性はすべて`deterministic`、`scores`は空。`config`は`maxScanCells`、実装版は`TABLE_ADAPTER_VERSION`（検出規則を変えて出力が変わり得るときに上げる）。
- `reference`は既存のMMI記法（見出しが確かなときだけ`?header=first`）。`mmi inspect`の既存の`reference`と一致する。
- アダプタは`src/adapters`に置く。領域検出が`src/search`にあるため`src/core`に置くと依存が逆になる。検出器を`core`へ移すのは[issue-0203](../01_Plans/issues/issue-0203-portable-core-minimum-binary.md)の範囲。

## 3b. Excel画像のSource Adapter（issue-0194）

`readExcelImages()`は.xlsxのOOXMLパッケージ（ワークブック → シート → drawing → mediaの関係）を直接読み、`image`のCandidateへ変換する（`src/adapters/excelImageAdapter.ts`、zip読込は`src/core/zipReader.ts`）。SheetJS community版は画像を解釈しないため、依存を足さずに自前で読む。

| 主張 | 状態 | method | 根拠 |
| --- | --- | --- | --- |
| `location`（anchorのA1範囲） | `observed` | M0 | drawingのanchor。2セルanchorは終端が前のセル（オフセット0のとき）。1セルanchorは開始セルのみ、絶対anchorはセルを持たず`location`を主張しない |
| `media`・`format`・`bytes`・`digest`・`name`・`description` | `observed` | M0 | パッケージの部品名、シグネチャ、サイズ、sha256、図形のプロパティ |
| `nearby-table` | `inferred` | M1 | セル矩形の重なり・隣接だけ（`overlaps`/`above`/`below`/`left`/`right`、距離10セルまで。斜めは無関係）。モデルは使わない |

- Candidate全体は`observed`（画像とその位置はパッケージが述べている）、実行特性は`deterministic`。fingerprintは**画像バイト列**のsha256（`image-media-bytes-v1`）で、同じ画像は置き場所が違っても同じfingerprintになる。
- 診断（黙って失敗しない）: `MMI_IMAGE_NOT_A_PACKAGE`・`PACKAGE_UNSUPPORTED`（ZIP64・暗号化・旧`.xls`）、`DRAWING_UNREADABLE`、`MEDIA_MISSING`（CRC不一致を含む）、`EXTERNAL_LINK`、`UNSUPPORTED_FORMAT`（EMF/WMF/TIFFは列挙するが書き出さない）。1枚の失敗が他の画像を止めない。
- zip読込は、エントリ数・展開サイズに上限があり、CRCとサイズを検証する（巨大な展開で記憶域を使い切らない）。
- 図形（AutoShape・connector）とグラフは数だけ記録し解釈しない（issue-0199以降）。

`mmi extract`は画像を`assets/<ダイジェスト先頭12桁>.<拡張子>`へ書き出し、`![代替文](相対パス)`と出典コメントを出す。名前を内容由来にしたので、同じ画像は1ファイルに集約され、Excelで画像を動かしても名前が変わらない。同名で内容が違えば上書きせず拒否する。

### fingerprint（暫定）

表のfingerprintは、範囲の**表示セル値の列**（セルを`U+001F`、行を`U+001E`で連結）のsha256とし、`representation`は`table-display-cells-v1`とする。**位置を含めない**ので、表が別の行へ動いても同じfingerprintになり、セルを1つ変えると変わる。位置は`locator`が別に持つ。ADR-0019 D8のとおり方式は種別ごとに異なってよい。台帳での使い方（移動・再取り込みの判定）は[issue-0195](../01_Plans/issues/issue-0195-import-ledger.md)で確定し、必要なら`representation`を上げる。

## 4. CLI

`mmi inspect <source> --json`の出力に`candidates`を加えた（`sheets`・`regions`・テキスト出力は変えない）。

- 実務サンプルの全20ブック（CSV・TSV・XLSX・XML 2003）と基本設計書キットのマスター（5シート）で、`candidates`の件数が`regions`の件数と一致し、各Candidateが不変条件と`reference`の一致を満たすことを確認した。
- 認知側の処理が`check`の診断と`render`の論理表を変えないことを、同一入力での実行前後の比較と、権威経路（`render`・診断・表の描画）が`adapters/`・`search/`・`experimental/`・`core/candidate`を読み込まないことの静的検査で確かめる（`test/candidate.test.ts`）。

## 5. Cognitive Contractの状態語彙の対応（案）

研究層の`CognitiveSignalOutcome`（`src/experimental/cognitiveContract.ts`）をCandidateに載せるときの変換。

| 研究層の状態 | Candidateの状態 | 備考 |
| --- | --- | --- |
| signal | `inferred` | providerの名前空間つきスコアは`scores`へ（尺度は合成しない） |
| abstained | `abstained` | `reasonCode`にそのコード |
| unsupported / unavailable / error | `abstained` | 失敗や非対応も「主張しない」。理由コードで区別する |
| 人手の承認（`FormatProfileV1`のapproved、貼り付け出所の選択） | `confirmed` | 承認者・参照は台帳（issue-0195）へ |

## 6. 研究層の成果の対応表

実コードを確認した結果。研究コードの移動・削除はしない。層はADR-0018、method classはADR-0020。

| コンポーネント | 出力 | Candidate種別 | 状態 | 実行特性 | method | 合流時の不足・注意 |
| --- | --- | --- | --- | --- | --- | --- |
| `search/regionDetector.ts`（製品） | ブロックごとの範囲・表題・見出し・理由 | Table / Range | 座標`observed`、境界・見出し`inferred` | deterministic | M0＋M1 | **本契約で実装済み**。fingerprintは暫定 |
| `search/verify.ts`、`regionCatalog.ts`、`workspaceRegionIndex.ts` | 現在の原本に対する再照合、(mtime,size)の差分更新 | Table / Rangeの鮮度 | `inferred`の維持確認 | deterministic | M1 | 「古い」を状態に写していない。台帳で扱う |
| `core/contentMatch.ts`、`dx/contentMatchSearch.ts` | 貼り付け値と一致する矩形 | Table / Rangeの出所照合 | `inferred`。人の選択で`confirmed` | deterministic | M1 | 内部座標は0始まり、ADR・SAIは1始まり。統一が要る |
| `dx/clipboardProvenance.ts`、`windowsClipboard.ts` | Excelコピーの出所（パス・シート・住所）を原本で検証した候補 | Table / Range | 宣言は`observed`、検証後に候補、選択で`confirmed` | deterministic（Windows依存の取得） | M0＋検証 | `confirmed`に至る唯一の製品経路。provenanceとfingerprintの項目を未対応 |
| `search/retrievers.ts`、`searchIndex.ts`、`nlQuery/*` | 説明文に対する順位付き候補 | Candidateの検索 | `inferred` | deterministic（FlyHashも固定射影） | M2 | スコアは検索内部の値。`confidence`と呼ばず、`scores`のproviderを分ける |
| `experimental/structuredArtifactNeutralObservation.ts` | 中立スキーマ（region、features、labels、provenance） | Table / Rangeの特徴の入れ物 | features`observed`/`inferred`混在 | deterministic | M1 | provenance構造がCandidateに最も近い。`confidence: number\|null`の尺度は未分離。`label_source`にteacher候補があり、provider依存の混入口 |
| `experimental/mmiWorksheetStructuredArtifactNeutralAdapter.ts` | シート全体の外接矩形1つ（`labels`は空） | Table / Range（粗い） | features`observed`、見出し信号`inferred` | deterministic | M1 | 領域が1つで複数表を扱えない。`source_digest`＋`adapter_config_digest`がfingerprint相当 |
| `experimental/mmiWorksheetStructuredArtifactSai1Adapter.ts`、`structuredArtifactBodyCandidateSignal.ts` | `role.body_candidate_signal`（confidenceなし） | Table / Rangeの本文らしさ | `inferred` | deterministic | M1 | 信頼度を持たず契約と相性が良い。2値で`abstained`を表せない |
| `experimental/structuredArtifactSai2CandidateSet.ts`、`...CandidateFeatures.ts` | `detectRegions`の候補集合（最大32件、超過は`generator_ood`）と5特徴 | Table / Rangeの候補集合 | `inferred`、`generator_ood`は事実上`abstained` | deterministic | M1 | 順位付けは未実装。合成18グループのみの結果で、実データ検証が先 |
| `experimental/worksheetFormatFeatureAdapter.ts`、`sheetJsWorksheetFormatBridge.ts`、`xlsxFormatSnapshotReader.ts` | 書式スナップショットと書式feature文字列 | 書式プロファイルの入力（属性） | `observed` | deterministic | M0 | locatorがない。SheetJS CE 0.20.3とsource profileに依存 |
| `experimental/flyInspiredFormatMatcher.ts`、`worksheetFormatPrototype.ts` | 既知書式との照合（matched / ambiguous / novel） | 書式プロファイル（属性） | `inferred`。ambiguous・novelは`abstained`に近い | deterministic | M2 | 閾値の根拠は評価ファイルのみ。実運用の書式で未検証 |
| `experimental/flyWorksheetFormatPerceptionProvider.ts` | `CognitiveSignalOutcome`（scoresはprovider名前空間つき） | 書式プロファイル（属性） | 前節の対応表 | deterministic（local） | M2 | 状態語彙の変換が要る（前節） |
| `experimental/formatProfile.ts` | `FormatProfileV1`（candidate / approved） | 書式プロファイル（承認つき） | `candidate`は`inferred`、承認後`confirmed` | deterministic＋人手 | M1＋人手 | `confirmed`の実装済みの数少ない例。承認者を台帳へ |
| `experimental/jevWorksheetReviewRouteProvider.ts`、`jevChoiceJudgmentProvider.ts` | 閉じた選択（inspect / routine）、probability、`applyAuthority: none` | レビュー優先度（属性） | `inferred`または`abstained` | **provider-dependent**（external-opt-in） | M4相当 | probabilityは別名前空間のまま保つ。較正結果は未確認 |
| `experimental/cognitiveReviewEnvelope.ts`、`deterministicReviewEvidence.ts`、`cognitiveReviewPresentation.ts` | `writeAuthority: none`の確認用封筒と表示物 | Candidateを人に見せる器 | 中身の状態を運ぶ | 混在 | 封筒M0 | issue-0202のレビューUIの雛形。高い信頼度が自動採用を意味しない境界を維持 |
| `experimental/authorityRevalidationAdapter.ts`ほか（receipt、overlay） | 埋め込み提案の再検証受領書 | Table / Rangeの`confirmed`への経路 | `confirmed`の機械側根拠 | deterministic | M1 | 対象が「記法の提案」で「領域Candidate」ではない。fingerprintとproposal digestの橋渡しが未設計 |

**Candidateに対応しないもの。** 事前登録・凍結・保持評価・実データ集計・handoff適合性などの統制手続きのテストと証跡（`structuredArtifactSai*.test.ts`、対応するfixture）、ラベル方針・参照target・コーパス定義（`structuredArtifactLabelPolicy`ほか。`product_runtime_authority: false`）、review routeの人手注釈・裁定・評価台帳と評価実行器、書式照合の閾値・特徴・ドリフトの評価ハーネス、上記部品をつなぐ配線（`contained*Workflow`ほか）、レビュー画面の表示計画・ViewModel、観測の同一性（`worksheetFormatObservationIdentity`。fingerprint設計の参考にはなる）。いずれも評価・統制・配線・表示であり、新しい認識結果を作らない。

### 実コードと食い違っていた記述（訂正）

[ギャップ分析](../01_Plans/product-gap-analysis.md)の旧§5は、次を研究済みの成果として並べていたが、実コードでは生成されていない。

- `region.hierarchy_relation`、`region.repeated_block`、`ambiguous_or_non_table`は、`structuredArtifactNeutralObservation.ts`に**ラベル名として宣言があるだけ**で、`src`にも`test`にも出力する生成コードが無い。中立アダプタは`labels: {}`を返し、ラベルを持つのは合成fixtureの正解側だけである。
- したがって**Tree / Hierarchy、Note、Choice list、Sectionは「研究済み」ではなく未着手**である。これらを強くするには、研究ではなくAdapterの新規実装から始める（issue-0199）。

## 7. 次に強くする行

1. **Table / Range**（製品の領域検出＋出所照合＋再照合）。唯一、`observed → inferred → confirmed`の経路が動いている。fingerprintを台帳で使う形に固める（issue-0195）。
2. **`cognitiveContract.ts`の器**。provenanceとscoreの名前空間が契約に近い。足りないのは状態・method class・fingerprint・locatorで、状態語彙の変換（§5）を先に確定する。
3. **Tree / Hierarchy・Section**。未着手。明示構造（JSON/XML、Excelのインデント・グループ）から始める（issue-0199）。
4. SAI2の結果は合成18グループのみで、製品の特徴に使う前に実データでの検証が要る。
