# MMI Notation v1 — 仕様書 / Specification (Draft)

- Version: 1.0.0-draft.1（SemVer。v1.0.0 到達時にコア構文を凍結 / core syntax freezes at 1.0.0）
- Status: Draft
- Normative language: 本書の **MUST / MUST NOT / SHOULD / MAY** は RFC 2119 に従う。日本語正文が規範であり、英文は参考訳（EN mirrors are informative）。
- 決定正本 / Decision record: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md`
- Machine-readable contract: [`params.schema.json`](./params.schema.json) / conformance corpus: `03_Implement/test/conformance/`

---

## 1. 目的 / Purpose

MMI Notation は、テキスト文書から正本表データ（CSV / XLSX / XML Spreadsheet 2003 等）の必要断面を
**宣言的・読み取り専用・検証可能**に参照するための記法である。
コピーによる二重管理を参照による単一正本へ置き換え、人間と AI エージェントが共存する文書運用の
ガバナンス境界として機能する。

> EN: MMI Notation is a declarative, read-only, verifiable way to reference slices of canonical
> tabular data from text documents, replacing copy-paste duplication with references.

## 2. 設計原則（規範）/ Normative Principles

| # | 原則 | 規範文 |
|---|---|---|
| P1 | **Read-only** | 準拠プロセッサは参照先を**改変してはならない** (MUST NOT modify referenced sources)。 |
| P2 | **Visible degradation** | 記法を解釈しないホストでは原文がそのまま可視であること。準拠プロセッサは解釈失敗を**沈黙で隠してはならない** (failures MUST be visible, never silent)。 |
| P3 | **Determinism** | 同一の正本 + 同一の参照 → 同一の論理表 (same source + same reference MUST yield the same logical table)。 |
| P4 | **Containment** | パス解決は文書基準の相対解決とワークスペース境界内に限定する (resolution MUST stay within the workspace boundary)。コア仕様はネットワーク取得を含まない。リモートソースは明示 opt-in の拡張とする。 |
| P5 | **Forward compatibility** | 未知のクエリキーはエラーにせず**無視しなければならない** (unknown query keys MUST be ignored)。実験キーは `x-` 名前空間を用いる (SHOULD)。 |
| P6 | **Stable diagnostics** | §9 の診断コードは安定 API であり、意味を変えてはならない (diagnostic codes are a stable API)。 |
| P7 | **i18n 中立** | クエリキーは ASCII、値は任意の Unicode (MAY)。ロケール固有の出版概念は Profile（§8）に隔離する。 |
| P8 | **Machine-readable contract** | パラメータ定義（JSON Schema）と conformance corpus を仕様と同時に公開する。 |

## 3. 構文 / Syntax

```
reference   = "![[" body "]]"
body        = target [ "#" sheet ] [ "|" range-and-params ]
range-and-params = [ range ] [ "?" params ]
target      = 1*CHAR              ; ファイルパス（文書からの相対 or ワークスペース相対）
sheet       = 1*CHAR              ; シート名（省略可）
range       = cell [ ":" cell ]   ; A1 形式（省略可）
cell        = 1*ALPHA 1*DIGIT     ; 大文字小文字を区別しない
params      = URL クエリ文字列（application/x-www-form-urlencoded）
```

### 3.1 パース規則（規範）
1. インライン抽出は非貪欲（最初に閉じる `]]` まで）で行う (MUST)。
2. `body` は最初の `|` で 2 分割する。前半をさらに最初の `#` で `target` / `sheet` に分割する (MUST)。
3. `|` 以降があれば最初の `?` で `range` / `params` に分割する。`|` が無い場合、`target` 内の最初の `?` 以降を `params` として扱い、`target` から除去する (MUST)。
4. `target` は前後空白を除去する。空になった参照は**記法として扱わない**（原文のまま残す）(MUST)。
5. `params` は URL クエリとして解釈する（パーセントデコード・`&` 区切り・同名キーの複数出現を許す）(MUST)。

### 3.2 既知の構文制約（正直な限界）
- **Markdown テーブルのセル内**では `|` がテーブル区切りと衝突するため、v1 コアはテーブル内参照を**サポートしない**。参照はブロックレベル（独立行）または通常段落に置くこと (SHOULD)。
- CommonMark 素通し時は `![[...]]` が画像記法の断片として分解され得るが、いずれの場合も原文文字列が可視である（P2 充足）。
- Obsidian 系ホストでは「エイリアス付き埋め込み」として解釈され得る（概ね無害な劣化）。劣化クラスの詳細は §10。

## 4. 解決モデル / Resolution

1. `target` は**参照元文書からの相対パス**として解決を試みる (MUST)。
2. 失敗時、**ワークスペースルートからの相対パス**へフォールバックする (SHOULD)。
3. いずれもワークスペース境界内に限定する（P4）。境界外・存在しないパスは §9 の診断対象。

## 5. ソースモデル / Source Model

| 種別 | conformance | 備考 |
|---|---|---|
| CSV | L1 で MUST | シート名は `Sheet1` 相当の単一シートとして扱う |
| XLSX | L2 で MUST | シート名で対象を選択 |
| XML Spreadsheet 2003 | L2 で MUST | 先頭シグネチャ（`mso-application progid="Excel.Sheet"`）を検証し、汎用 XML は**拒否して可視エラー**とする (MUST) |
| その他（JSON / Parquet / DB 等） | 拡張 | コア外。abstract source provider の拡張点として将来定義（コアを肥大させない） |

## 6. 変換パイプライン（規範・この順序）/ Transformation Pipeline

決定論（P3）のため、論理表は以下の順で構成しなければならない (MUST, in this exact order):

1. **slice**: `range` があれば A1 範囲で行列を切り出す（単一セル指定は 1×1）。
2. **columns**: `columns=A,C,F`（A1 列文字、大文字小文字不問）で指定列のみ抽出。欠損セルは空文字。
3. **transpose**: `transpose=true` で行列反転（最長行に合わせ空文字補完）。
4. **header 分離**: `header=first` は先頭行、`header=<n>`（1 始まり）は**変換後の第 n 行**をヘッダとし本体から除く。`header=none`／未指定はヘッダなし。範囲外の `<n>` は可視エラー。
5. **grep**: `grep=<kw>` は本体行のうち、いずれかのセルに `<kw>` を**大文字小文字不問の部分一致**で含む行のみ残す。結果 0 行はエラーではなく空の本体 (MUST)。

装飾（論理表を変えない）:
- **highlight**: `highlightColumn`（ヘッダ名を大小・前後空白不問で照合、なければ A1 列文字）と `highlightValue`（trim + 小文字化で比較）が一致する行に強調区分を付す。`highlightValue` が無ければ強調しない。
- **formatColumn**: `<selector>:<format>` 形式（複数指定可）。対象セルをコード表示区分（format 名は小文字化）にする。不正な指定は無視する (MUST)。

## 7. Smart Fallback（規範）

参照は以下の判定で**表**または**カード（別紙参照）**として描画される:

1. `mode=card` → カード (MUST)。ソース読込前に短絡してよい (MAY)。
2. `mode=table` → 表を強制 (MUST)。
3. `sheet` 未指定（ファイル全体参照）→ カード (MUST)。
4. slice 後の列数 > 10 またはセル数 > 500 → カード (MUST)。
5. 上記以外 → 表。

カードは最低限「ファイル名」「シート/範囲（あれば）」を表示し、参照先の絶対パスを機械可読属性で保持する (MUST)。

## 8. Conformance Levels / 準拠レベル

部分実装でも準拠を名乗れる。上位レベルは下位レベルを包含する (Each level includes all lower levels)。

| Level | 名称 | 要件（MUST） |
|---|---|---|
| **L0** | Parse & Passthrough | §3 の構文を認識し、解釈しない場合は原文を可視のまま残す。データアクセス不要。 |
| **L1** | Static Slice | CSV ソース + range + `header` / `columns` / `grep`（§6 の 1,2,4,5）。P1–P5 遵守。 |
| **L2** | Workbook & Query | XLSX / XML 2003 + 全 12 パラメータ + `transpose` / highlight / formatColumn + Smart Fallback **判定**（カード描画の体裁は自由）+ §9 診断。 |
| **L3** | Publication Profiles | 下記 Delivery Profile を実装。 |

### 8.1 Delivery Profile（L3）
エンタープライズ納品向けの出版制御。ロケール固有概念（別紙・改ページ・用紙向き）は本 Profile に隔離される（P7）。

- `caption`: 表題を埋め込みブロックへ付す。
- `id`: 相互参照アンカーとしてブロックに付す。
- `pageBreak` ∈ {`before`,`after`,`both`}: 印刷時改ページの機械可読属性を付す。**それ以外の値は黙って無効化する** (MUST ignore invalid values without error — safe degradation)。
- `orientation` ∈ {`landscape`,`portrait`}: 用紙向きの機械可読属性を付す。不正値は同上。
- **別紙マニフェスト**: カード化された参照の一覧を CSV（列: `sourcePath,sheet,range,reason,caption,id`）として出力する機能を提供する (MUST)。
- 参照実装の HTML 契約（クラス名 `mmi-embed` / `mmi-table` / `mmi-card` / `mmi-error`、`data-page-break` / `data-orientation` / `data-path` 属性）は本 Profile の一部である。

## 9. 診断 / Diagnostics（安定 API）

| コード | 条件 | 期待挙動 |
|---|---|---|
| `MMI_FILE_NOT_FOUND` | 解決不能な `target` | エラー該当箇所を利用者に可視化 |
| `MMI_SHEET_NOT_FOUND` | 存在しない `sheet` | 同上 |
| `MMI_INVALID_XML` | XML 2003 シグネチャ不一致 | パース中断・可視エラー（正本は読み込まない） |
| `MMI_PATH_OUTSIDE_BOUNDARY` | `target` はファイルとして存在するが P4 の境界（ワークスペース境界）外 | プレビュー描画前に Problems パネルで検知、かつ描画時も可視エラー（issue-0105） |

レンダリング時の失敗は**可視のエラー表示**（参照実装では `mmi-error` ブロック）としなければならない (MUST)。空白化・黙殺は P2 違反である。

## 10. 劣化クラス / Degradation Classes

| クラス | ホスト例 | 期待劣化 |
|---|---|---|
| D0: 素通し | CommonMark レンダラ | 原文文字列が可視のまま残る |
| D1: 別解釈 | Obsidian（埋め込み+エイリアス） | 参照先ファイルの埋め込み試行等。データ破壊なし |
| D2: 部分解釈 | L1 実装に L2 文書を与えた場合 | 未知パラメータは無視（P5）、未対応ソースは可視エラー |

いずれのクラスでも**正本が改変されないこと**（P1）は不変条件である。

## 11. 版管理 / Versioning

- 本仕様は SemVer に従う。v1.0.0 で §3 構文と §6 パイプライン順序を凍結する。
- 追加パラメータは minor。既存パラメータの意味変更は major でのみ許す。
- 実験は `x-` プレフィックスキーで行い、コア昇格時に改名する。

## 12. 適合の確認 / Conformance Testing

conformance corpus（`03_Implement/test/conformance/cases.json`）は本仕様の規範例であり、
各ケースは「入力 Markdown + ソースファイル群 + 期待される出力断片/診断」を機械可読に宣言する。
実装は自レベルの全ケースに合格することで準拠を主張できる。corpus は同時に
AI エージェントへの記法教示データとして利用できる（P8）。
