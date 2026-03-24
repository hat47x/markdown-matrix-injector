# Markdown Matrix Injector Tutorial

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-tutorial](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-tutorial)
- Canonical source: `04_Documentation/tutorial.md`

## Target reader
- はじめて Markdown Matrix Injector を試す利用者
- 最小構成で「まず 1 回成功したい」PoC 担当者

## Prerequisites
- `03_Implement` 配下で依存導入とビルドができること
- 手元に CSV もしくは XLSX のサンプルがあること
- Markdown ファイルから相対パスでデータファイルを参照できること

## Expected result
このチュートリアルを終えると、Markdown 内に外部表データを 1 件埋め込み、クエリパラメータで見せ方を変える基本操作を再現できます。

## Quickstart flow
### 1. 準備する
- Markdown ファイルと、同じワークスペース内の CSV または XLSX を用意します。
- 例として `docs/spec.md` から `../data/sample.csv` を参照する前提にします。

### 2. 最初の埋め込みを書く
次のような埋め込みを Markdown に記述します。

```md
![[../data/sample.csv#Sheet1|A1:C4]]
```

期待する結果:
- `A1:C4` の範囲が HTML テーブルとしてプレビューに表示される。
- 元の CSV / XLSX は編集されない。

### 3. 表示を絞り込む
次のようにクエリパラメータを付けます。

```md
![[../data/sample.csv#Sheet1|A1:F10?header=first&columns=A,C,E&grep=AUTH]]
```

期待する結果:
- 1 行目がヘッダとして扱われる。
- A, C, E 列だけが残る。
- `AUTH` を含む行だけが表示される。

### 4. 文書向けの装飾を試す
```md
![[../data/sample.csv#Sheet1|A1:F10?header=first&caption=認可一覧&id=tbl-auth&pageBreak=before&orientation=landscape]]
```

期待する結果:
- 埋め込みにキャプションと ID が付き、印刷制御用の属性も加わる。
- 大きい表では、設定やサイズ条件に応じて Smart Fallback が働くことがある。

### 5. 入力支援を使う
- `![[` を入力し始めたら候補を確認する。
- ファイルパス、`#` 後のシート、`?` 後のパラメータ候補が段階的に出ることを確認する。
- ファイル不在や無効 XML では Diagnostics が出ることを確認する。

## Related docs
- 価値や全体像: `04_Documentation/overview.md`
- 業務適用イメージ: `04_Documentation/scenario-sier-design-docs.md`
- パラメータ詳細: `04_Documentation/reference.md`
- 開発環境セットアップ: `04_Documentation/developer-setup.md`

## Known limitations
- Preview UI や native Paste / D&D の最終 UX は、host 環境と VSCode バージョンに影響されます。
- XML は XML Spreadsheet 2003 のみが対象で、汎用 XML はエラー表示になります。