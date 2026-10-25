# 利用者のCIで参照と鮮度を検査する

MMIのGitHub Action「MMI check」は、利用者のリポジトリで`mmi check`と`mmi provenance`を実行し、参照の誤り・取り込み資産の鮮度・Linked参照の見直し状態を、ジョブのサマリにまとめます。原本・台帳・成果物・Markdownは書き換えません。

この手順はIssue #526の実装です。基本設計書キットを複製したリポジトリでの実PR検証はまだ行っていません。

## 前提

- Node.js 20以上。
- MMI CLI（`mmi`）がジョブのPATHにあること。配布用tarballは#500のリリースから取得し、`npm install --global <tarball>`で導入できます。
- リポジトリに`mmi-ledger.json`があり、採用済みExtracted資産を追跡していること（任意）。
- Linked参照を見直し済みにする場合は、`mmi-review-basis.json`をコミットしておくこと（任意）。

## ワークフローの例

```yaml
name: MMI check

on:
  pull_request:

permissions:
  contents: read

jobs:
  mmi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install MMI CLI
        run: |
          # 例: リリースから取得したtarballを導入する
          npm install --global ./markdown-matrix-injector-0.2.0.tgz

      - name: MMI check
        uses: hat47x/markdown-matrix-injector/.github/actions/mmi-check@main
        with:
          root: .
          paths: docs
          ledger: mmi-ledger.json
          review-basis: mmi-review-basis.json
          fail-on: diagnostics,review-stale,missing
```

`@main`は例です。利用する版のタグまたはコミットに固定してください。

## Actionの入力

| 入力 | 既定値 | 内容 |
| --- | --- | --- |
| `root` | `.` | すべてのMMIコマンドに渡すワークスペース境界 |
| `paths` | `.` | 検査するMarkdownファイルまたはディレクトリ（カンマ区切り） |
| `ledger` | `mmi-ledger.json` | 取り込み台帳 |
| `review-basis` | `mmi-review-basis.json` | 見直し記録のsidecar |
| `fail-on` | `diagnostics,review-stale,missing` | ジョブを失敗させる条件 |
| `mmi` | `mmi` | PATH上のMMI実行ファイル |

`fail-on`の値:

- `diagnostics`: `mmi check`のエラー、または`provenance`の実行失敗。
- `stale`: 採用済みExtracted資産が現在の原本と一致しない。
- `review-stale`: Linked参照の論理表が、記録した見直し時点から変わっている。
- `missing`: 原本が見つからない、またはworkspace外。

既定では`stale`は失敗にしません。抽出資産の変更をレビューで確認する運用なら、`fail-on`へ`stale`を追加します。

## 出力

GitHubのJob Summaryに次の表を出します。

- Markdown文書数、参照エラー数、診断数。
- 変更・staleになったExtracted資産の数と一覧。
- 見直しが必要なLinked参照の数と一覧。
- 原本なしの数。
- 失敗した条件（`Failed by: ...`）。

詳細なJSONが必要な場合は、Actionの代わりに次を実行します。

```sh
mmi check docs --root . --json
mmi provenance docs/basic-design.md --root . --fail-on diagnostics,review-stale,missing --json
```

## 原本を変えたPRでの見方

1. 書き手はレビュー後に`mmi review-basis <doc.md> --write`を実行し、`mmi-review-basis.json`をコミットする。
2. 原本の参照範囲内が変わると、`provenance`の`review.references`が`stale`になり、`review-stale`を`fail-on`に含めていればジョブが失敗する。
3. 参照範囲外だけの変更では、論理表ダイジェストが変わらないため失敗しない。
4. 記録のない参照は`unrecorded`として表示される。`unrecorded`は既定では失敗にしない（新しい参照を追加した直後を止めないため）。厳格にしたい場合は、将来の`unrecorded`条件を追加するか、`provenance --json`を利用者側で判定する。

## 制約と未確認

- GitHub Actions以外のCIでも、`mmi check`と`mmi provenance --fail-on`を同じように呼べます。Actionはその薄いラッパーです。
- 基本設計書キットを複製したリポジトリで、正常・参照の誤り・原本変更の3ケースを実PRで確認する作業は未実施です。
- Actionはネットワークから原本を取得しません。依存の導入（CLIのインストール）だけがネットワークを使います。
- WindowsランナーではGit Bashが必要です（GitHub hosted runnerには含まれます）。

関連: [出典報告](provenance-report.md)、[ADR-0029](../01_Plans/adr/ADR-0029-ci-uses-the-same-read-only-cli-contract.md)、Issue #526。
