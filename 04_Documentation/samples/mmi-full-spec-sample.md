# MMI Full Spec Sample Markdown

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-full-spec-sample-markdown](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-full-spec-sample-markdown)
- Canonical source: `04_Documentation/samples/mmi-full-spec-sample.md`

このサンプルは `mmi-full-spec-sample.xlsx` を使って、Phase 1〜5 で定義された主要仕様を 1 つの Markdown で確認するためのものです。

## Target reader
- MMI の主要仕様（Phase 1〜5）を 1 ファイルで通し確認したい評価者。
- 仕様デモを再現し、Scenario から参照可能な実例を探しているドキュメント担当。

## Prerequisites
- Python 3 実行環境。
- `openpyxl` をインストールして `mmi-full-spec-sample.xlsx` を生成できること。
- MMI 記法（`![[...]]`）をレンダリングできる環境。

## Expected result
- Phase 1〜5 の主要パラメータ挙動を、単一 Markdown サンプルで順に確認できる。
- Scenario/Reference から参照する際に、章番号単位で説明しやすい具体例を得られる。

## Known limitations
- 本ファイルは手動確認用サンプルであり、自動テストの合否を保証しない。
- 実行結果は利用中のレンダラ実装状況に依存する。


## 事前準備 (Excel 生成)
`mmi-full-spec-sample.xlsx` は Git 管理しません。先に次のコマンドで人手生成してください。

```bash
python3 -m pip install --user openpyxl
python3 04_Documentation/samples/generate_mmi_full_spec_sample_xlsx.py
```

生成先: `04_Documentation/samples/mmi-full-spec-sample.xlsx`

## 1) 基本記法 (Phase 1)
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H6]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H6]]

## 2) header=first + columns + grep (Phase 2)
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&columns=A,B,D,F&grep=AUTH]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&columns=A,B,D,F&grep=AUTH]]

## 3) transpose=true (Phase 2)
```md
![[./mmi-full-spec-sample.xlsx#Transpose|A1:E4?header=first&transpose=true]]
```

![[./mmi-full-spec-sample.xlsx#Transpose|A1:E4?header=first&transpose=true]]

## 4) header=2 (数値指定) (Phase 2)
```md
![[./mmi-full-spec-sample.xlsx#HeaderRow|A1:C5?header=2]]
```

![[./mmi-full-spec-sample.xlsx#HeaderRow|A1:C5?header=2]]

## 5) highlight + formatColumn(複数) (Phase 2)
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&highlightColumn=role&highlightValue= admin &formatColumn=E:json&formatColumn=H:json]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&highlightColumn=role&highlightValue= admin &formatColumn=E:json&formatColumn=H:json]]

## 6) caption + id + pageBreak + orientation (Phase 3)
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?header=first&caption=認可マトリクス&id=tbl-auth-matrix&pageBreak=before&orientation=landscape]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?header=first&caption=認可マトリクス&id=tbl-auth-matrix&pageBreak=before&orientation=landscape]]

## 7) mode=card (Phase 4)
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?mode=card&caption=カード縮退サンプル]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?mode=card&caption=カード縮退サンプル]]

## 8) Smart fallback: 列数 10 超 (Phase 4)
```md
![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15]]
```

![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15]]

## 9) Smart fallback: セル数 500 超 (Phase 4)
```md
![[./mmi-full-spec-sample.xlsx#LargeMatrix|A1:Y26]]
```

![[./mmi-full-spec-sample.xlsx#LargeMatrix|A1:Y26]]

## 10) mode=table で Smart fallback をオーバーライド (Phase 4)
```md
![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15?mode=table&header=first]]
```

![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15?mode=table&header=first]]

## 11) シート未指定 (ファイル全体参照) (Phase 4)
```md
![[./mmi-full-spec-sample.xlsx]]
```

![[./mmi-full-spec-sample.xlsx]]

## 12) Autocomplete / Diagnostics / Paste&D&D の手動確認ポイント (Phase 5)
- Autocomplete: `![[` 入力後に filepath → `#` → sheet/range → `?` → parameter の順で候補が出ること。
- Diagnostics: ファイル名 typo や存在しない sheet 指定で Problems が出ること。
- Paste&D&D: Excel/スプレッドシート由来の貼り付けやドロップで embed 記法が挿入されること。
