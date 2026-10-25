# MMI Notation v1 — 仕様書 / Specification (Draft)

- Version: 1.0.0-draft.2（SemVer。v1.0.0到達時にコア構文を凍結 / core syntax freezes at 1.0.0。draft.2で§9の境界外判定を存在確認より前に固定 / #599）
- Status: Draft
- Normative language: 本書の MUST / MUST NOT / SHOULD / MAY はRFC 2119に従う。日本語正文が規範であり、英文は参考訳（EN mirrors are informative）。
- 決定正本 / Decision record: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md`
- Machine-readable contract: [`params.schema.json`](./params.schema.json) / conformance corpus: `03_Implement/test/conformance/`

---

## 1. 目的 / Purpose

MMI Notationは、テキスト文書から正本表データ（CSV / XLSX / XML Spreadsheet 2003等）の必要断面を
宣言的・読み取り専用・検証可能に参照するための記法である。
コピーによる二重管理を参照による単一正本へ置き換え、人間とAIエージェントが共存する文書運用の
ガバナンス境界として機能する。

> EN: MMI Notation is a declarative, read-only, verifiable way to reference slices of canonical
> tabular data from text documents, replacing copy-paste duplication with references.

## 2. 設計原則（規範）/ Normative Principles

| # | 原則 | 規範文 |
|---|---|---|
| P1 | **Read-only** | 準拠プロセッサは参照先を**改変してはならない** (MUST NOT modify referenced sources)。 |
| P2 | **Visible degradation** | 記法を解釈しないホストでは原文がそのまま可視であること。準拠プロセッサは解釈失敗を**沈黙で隠してはならない** (failures MUST be visible, never silent)。 |
| P3 | **Determinism** | 同一の正本 + 同一の参照 → 同一の論理表 (same source + same reference MUST yield the same logical table)。 |
| P4 | **Containment** | パス解決は文書基準の相対解決とワークスペース境界内に限定する (resolution MUST stay within the workspace boundary)。境界外と判定したパスは、存在確認のために読みに行かない。コア仕様はネットワーク取得を含まない。リモートソースは明示 opt-in の拡張とする。 |
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
2. `body` は最初の `|` で2分割する。前半をさらに最初の `#` で `target` / `sheet` に分割する (MUST)。
3. `|` 以降があれば最初の `?` で `range` / `params` に分割する。`|` が無い場合、`target` 内の最初の `?` 以降を `params` として扱い、`target` から除去する (MUST)。
4. `target` は前後空白を除去する。空になった参照は記法として扱わない（原文のまま残す）(MUST)。
5. `params` はURLクエリとして解釈する（パーセントデコード・`&` 区切り・同名キーの複数出現を許す）(MUST)。

### 3.2 既知の構文制約（正直な限界）
- Markdownテーブルのセル内では `|` がテーブル区切りと衝突するため、v1コアはテーブル内参照をサポートしない。参照はブロックレベル（独立行）または通常段落に置くこと (SHOULD)。
- CommonMark素通し時は `![[...]]` が画像記法の断片として分解され得るが、いずれの場合も原文文字列が可視である（P2充足）。
- Obsidian系ホストでは「エイリアス付き埋め込み」として解釈され得る（概ね無害な劣化）。劣化クラスの詳細は §10。

## 4. 解決モデル / Resolution

1. `target` は参照元文書からの相対パスとして解決を試みる (MUST)。
2. 失敗時、ワークスペースルートからの相対パスへフォールバックする (SHOULD)。
3. いずれもワークスペース境界内に限定する（P4）。境界外・存在しないパスは §9の診断対象。

## 5. ソースモデル / Source Model

| 種別 | conformance | 備考 |
|---|---|---|
| CSV | L1 で MUST | シート名は `Sheet1` 相当の単一シートとして扱う |
| XLSX | L2 で MUST | シート名で対象を選択 |
| XML Spreadsheet 2003 | L2 で MUST | 先頭シグネチャ（`mso-application progid="Excel.Sheet"`）を検証し、汎用 XML は**拒否して可視エラー**とする (MUST) |
| その他（JSON / Parquet / DB 等） | 拡張 | コア外。abstract source provider の拡張点として将来定義（コアを肥大させない） |

## 6. 変換パイプライン（規範・この順序）/ Transformation Pipeline

決定論（P3）のため、論理表は以下の順で構成しなければならない (MUST, in this exact order):

1. **slice**: `range` があればA1範囲で行列を切り出す（単一セル指定は1×1）。
2. **columns**: `columns=A,C,F`（A1列文字、大文字小文字不問）で指定列のみ抽出。欠損セルは空文字。
3. **transpose**: `transpose=true` で行列反転（最長行に合わせ空文字補完）。
4. **header分離**: `header=first` は先頭行、`header=<n>`（1始まり）は変換後の第n行をヘッダとし本体から除く。`header=none`／未指定はヘッダなし。範囲外の `<n>` は可視エラー。
5. **grep**: `grep=<kw>` は本体行のうち、いずれかのセルに `<kw>` を大文字小文字不問の部分一致で含む行のみ残す。結果0行はエラーではなく空の本体 (MUST)。

装飾（論理表を変えない）は次のとおりです。
- **highlight**: `highlightColumn`（ヘッダ名を大小・前後空白不問で照合、なければA1列文字）と `highlightValue`（trim + 小文字化で比較）が一致する行に強調区分を付す。`highlightValue` が無ければ強調しない。
- **formatColumn**: `<selector>:<format>` 形式（複数指定可）。対象セルをコード表示区分（format名は小文字化）にする。不正な指定は無視する (MUST)。

## 7. Smart Fallback（規範）

参照は以下の判定で表またはカード（別紙参照）として描画される。

1. `mode=card` → カード (MUST)。ソース読込前に短絡してよい (MAY)。
2. `mode=table` → 表を強制 (MUST)。
3. `sheet` 未指定（ファイル全体参照）→ カード (MUST)。
4. slice後の列数 > 10またはセル数 > 500 → カード (MUST)。
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
エンタープライズ納品向けの出版制御。ロケール固有概念（別紙・改ページ・用紙向き）は本Profileに隔離される（P7）。

- `caption`: 表題を埋め込みブロックへ付す。
- `id`: 相互参照アンカーとしてブロックに付す。
- `pageBreak` ∈ {`before`,`after`,`both`}: 印刷時改ページの機械可読属性を付す。それ以外の値は黙って無効化する (MUST ignore invalid values without error — safe degradation)。
- `orientation` ∈ {`landscape`,`portrait`}: 用紙向きの機械可読属性を付す。不正値は同上。
- **別紙マニフェスト**: カード化された参照の一覧をCSV（列: `sourcePath,sheet,range,reason,caption,id`）として出力する機能を提供する (MUST)。
- 参照実装のHTML契約（クラス名 `mmi-embed` / `mmi-table` / `mmi-card` / `mmi-error`、`data-page-break` / `data-orientation` / `data-path` 属性）は本Profileの一部である。

## 9. 診断 / Diagnostics（安定 API）

| コード | 条件 | 期待挙動 |
|---|---|---|
| `MMI_FILE_NOT_FOUND` | 解決不能な `target` | エラー該当箇所を利用者に可視化 |
| `MMI_SHEET_NOT_FOUND` | 存在しない `sheet` | 同上 |
| `MMI_INVALID_XML` | XML 2003 シグネチャ不一致 | パース中断・可視エラー（正本は読み込まない） |
| `MMI_PATH_OUTSIDE_BOUNDARY` | `target` の解決候補がすべて字句の上で P4 の境界（ワークスペース境界）外。**存在確認より先に判定する**。境界内の候補が実体はシンボリックリンクで外を指す場合も同じ | プレビュー描画前に Problems パネルで検知、かつ描画時も可視エラー（issue-0105、#599）。境界外の存在有無を診断で明かさない。存在しない境界内のパスは`MMI_FILE_NOT_FOUND` |

レンダリング時の失敗は可視のエラー表示（参照実装では `mmi-error` ブロック）としなければならない (MUST)。空白化・黙殺はP2違反である。

## 10. 劣化クラス / Degradation Classes

| クラス | ホスト例 | 期待劣化 |
|---|---|---|
| D0: 素通し | CommonMark レンダラ | 原文文字列が可視のまま残る |
| D1: 別解釈 | Obsidian（埋め込み+エイリアス） | 参照先ファイルの埋め込み試行等。データ破壊なし |
| D2: 部分解釈 | L1 実装に L2 文書を与えた場合 | 未知パラメータは無視（P5）、未対応ソースは可視エラー |

いずれのクラスでも正本が改変されないこと（P1）は不変条件である。

## 11. 版管理 / Versioning

- 本仕様はSemVerに従う。v1.0.0で §3構文と §6パイプライン順序を凍結する。
- 追加パラメータはminor。既存パラメータの意味変更はmajorでのみ許す。
- 実験は `x-` プレフィックスキーで行い、コア昇格時に改名する。

## 12. 適合の確認 / Conformance Testing

conformance corpus（`03_Implement/test/conformance/cases.json`）は本仕様の規範例であり、
各ケースは「入力Markdown + ソースファイル群 + 期待される出力断片/診断」を機械可読に宣言する。
実装は自レベルの全ケースに合格することで準拠を主張できる。corpusは同時に
AIエージェントへの記法教示データとして利用できる（P8）。

## 参照実装のCSV文字コード（非規範）

VS Code参照実装はUTF-8（BOM有無）を優先し、UTF-8として不正な場合にWindows-31J（CP932）を試す。BOMでUTF-8と明示された不正データは別の文字コードへ切り替えない。UTF-16 BOMと、両方式で復号できないデータは読込みエラーとする。自動判定は推定であり、両方式で有効なバイト列はUTF-8として解釈する。この方針は新しい記法パラメータや他処理系への準拠要件を追加しない。

復号はNodeのTextDecoderを用いる。[対応文字コードとICU要件](https://nodejs.org/api/util.html#whatwg-supported-encodings)を参照。実機互換性は配布するVSIXの対象宿主で確認する。

## 付録: 外部の判断記録で根拠を固定する（非規範）

本節は参考情報であり、構文、パラメータ、変換、診断、準拠要件のいずれも追加・変更しない。

設計判断、変更要求の判定、レビューへの回答などを別のシステムで記録するとき、判断の根拠にした表を「そのとき見た内容」に固定し、後から確かめたい場合がある。本節ではこれを根拠の固定（Exact Binding）と呼ぶ。MMIの参照 `![[target#sheet|range?params]]` は、その材料として使える。記録する側は、次の要素を組にして保持する。

| 要素 | 意味 | MMIでの求め方 |
|---|---|---|
| 参照 | どのファイルの、どのシートの、どの範囲を、どの条件で見たか | 参照文字列と、それを含む文書の位置（§4の相対解決の基準） |
| 内容の同一性 | 参照したときの正本の内容 | 解決した正本ファイルのバイト列全体にSHA-256を適用した値（`sha256:` に続く小文字16進64桁） |
| 算出方式 | 同一性を計算し直す方法 | 「ファイルのバイト列を変換せず、そのままSHA-256にかける」方式であることを示す識別子 |
| 解釈の条件（推奨） | 同じ論理表を再現するための条件 | 本仕様の版（例: `1.0.0-draft.1`）と、処理系の準拠レベル |

- **再現できる理由:** P3により、同じ正本と同じ参照からは同じ論理表が得られる。参照と内容の同一性がどちらも一致すれば、判断のときと同じ論理表を再現できる。ただし、下位レベルの処理系は未知のパラメータを無視する（P5、§10のD2）ため、解釈の条件も残しておくとよい。
- **同一性の単位:** 同一性はファイル全体に対するもので、参照した範囲だけのものではない。範囲の外が変わっても一致しなくなる。したがって、一致しないことは「範囲の内容が変わった」ことではなく、「判断のときと同じ内容だとは確かめられない」ことを意味する。範囲に限った同一性は本仕様では定めない。
- **後から確かめるとき:** 参照を§4の規則で解決し、同じ方式で同一性を計算し直す。結果は「一致」「不一致」「確かめられない」の3つに分ける。ファイルが見つからない（`MMI_FILE_NOT_FOUND`）、境界の外にある（`MMI_PATH_OUTSIDE_BOUNDARY`）など、正本のバイト列を読めない場合は「確かめられない」であり、一致とも不一致とも扱わない。
- **記法は変えない:** 同一性の値を参照文字列のクエリキーとして書き込むことは想定しない。本節は新しいパラメータを定めず、P5の扱いも変えない。値は判断を記録する側が持つ。
- **別紙マニフェストとの関係:** §8.1の別紙マニフェストは、内容の同一性を列に含まない。記録する側は、参照を解決した正本ファイルから値を求める。
- **所在と識別を分ける:** 参照文字列はファイルの所在を含むため、正本を移したり名前を変えたりすると解決できなくなる。記録する側は表を指す識別子を自分で持ち、参照文字列は所在を示す情報として添えるとよい。
- **境界は変わらない:** 判断の記録から使われても、準拠プロセッサは参照先を読むだけで改変しない（P1）。コアはネットワークから取得せず、パスはワークスペース境界の中で解決する（P4）。判断の記録にはセル値を写さず、参照と同一性だけを残すと、正本を唯一の置き場として保てる。

対応の一例として、`hat47x/sei-cognition`のSemantic Reference Contract（`sei.semantic-reference/v1alpha1`）では、Exact Artifact Bindingが論理参照、内容のdigest、Representation Profileの識別子を組にする。上の表の「参照」「内容の同一性」「算出方式」がそれぞれに対応し、算出方式は`sei.raw-bytes+sha256/v1alpha1`にあたる。SEIはファイルパスを論理参照そのものにしないため、MMIの参照文字列は所在を示す情報として扱われる。

> EN (informative): An external decision record can bind an MMI table slice as evidence by keeping the reference string (with the location of the referencing document), the SHA-256 of the resolved source file bytes, and optionally the notation version and conformance level. The digest covers the whole file, not the slice. This appendix adds no parameters and leaves P1, P4 and P5 unchanged.

## 実験キー`x-headers`（非規範）

[ADR-0022](../../01_Plans/adr/ADR-0022-semantic-selection-in-notation.md)の試行（選択肢B）として、参照実装は実験キー`x-headers`を検証に使う。このキーは**規範の一部ではない**。準拠プロセッサは、未知の`x-`キーとして無視してよく（P5）、無視しても表示は変わらない。

```text
![[./設計.xlsx#権限|A1:F13?header=first&columns=B,D&x-headers=操作,承認者]]
```

- **意味:** 参照を書いたときに表示されていた見出し（`header`で決まる見出し行）を、列の順に並べた期待値。カンマ区切りで、見出しの中のカンマは`\,`、バックスラッシュは`\`と書く。比較は前後の空白と連続する空白を整理してから行う。
- **目的:** 正本で列の挿入・削除・並べ替えがあると、`columns=B,D`のような座標の指定は黙って別の列を指す。`x-headers`は、その食い違いを検査する側が見つけられるようにする。直すのは人かAIで、自動では追従しない。
- **参照実装の動作:** 現在の表の見出しと期待値が違うと、診断`MMI_HEADERS_MISMATCH`（警告）を出す。`header`が無く見出し行がないときは情報を出す。ファイルやシートが解決できないときは、その診断だけを出す。表示・変換・Smart Fallbackには影響しない。`mmi select`は、見出しのある表の参照に自動で付ける。
- **限界:** 同じ見出しの列が入れ替わった場合は検出できない。見出しの無い表には使えない。見出しの文言を人が直した場合も警告になる（意図した変更なら期待値を更新する）。

## 実験キー`x-below`（非規範）

[ADR-0022](../../01_Plans/adr/ADR-0022-semantic-selection-in-notation.md)の試行（選択肢B）として、参照実装は実験キー`x-below`を検証に使う。このキーは**規範の一部ではない**。準拠プロセッサは、未知の`x-`キーとして無視してよく（P5）、無視しても表示は変わらない。

```text
![[./設計.xlsx#受注登録|B11:AD19?header=first&x-below=0]]
```

- **意味:** 参照を書いたときに、範囲の直下へ何行続いていたか。範囲の列の中で、範囲の最終行の次の行から、すべての列が空になる行の手前までを数える。上限は1000で、それ以上は`1000`とする。数えるのは行数だけで、セルの値は記録しない。
- **目的:** 固定のA1範囲は、範囲の中に行が挿入されても解決し続ける。挿入された行は表示され、元の最終行は範囲の外へ出るが、参照を見ただけでは分からない。`x-below`は、範囲の末尾がそのときのデータの終わりだったのか（`0`）、下へ値が続いていたのか（`n`）を残し、その状態が変わったときだけ知らせる。直すのは人かAIで、自動では追従しない。
- **参照実装の動作:** 記録した行数よりいまの行数が多いと診断`MMI_BELOW_MISMATCH`（警告）を出す。少ないときは情報を出す。同じなら何も出さない。キーが無い参照には、これまでどおり何も出さない。`mmi select`と案内付き作成は、範囲を取ったときに自動で付ける。表示・変換・Smart Fallbackには影響しない。
- **限界:** 範囲の列の外だけが下へ続く場合は検出できない。範囲の下の行が入れ替わり、行数が変わらない場合も検出できない。範囲の下にある別の表へ行を足した場合も、行数が変われば知らせる（意図した変更なら記録を更新する）。
