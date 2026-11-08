# 利用者のCIで参照と鮮度を検査する

MMIのGitHub Action「MMI check」は、利用者のリポジトリで`mmi check`と`mmi provenance`を実行し、参照の誤り・取り込み資産の鮮度・Linked参照の見直し状態を、ジョブのサマリにまとめます。原本・台帳・成果物・Markdownは書き換えません。

この手順はIssue #526の実装です。基本設計書キットを複製したリポジトリでの実PR検証はまだ行っていません。

## 前提

- Node.js 20以上。
- MMI CLI（`mmi`）がジョブのPATHにあること。配布用tarballのリリース（#500）は未作成です。現時点では、MMIのチェックアウトから作ったtarball（`release:candidate`の成果物）を`npm install --global <tarball>`で導入します。
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
          # 例: 事前に作ったtarballを導入する（リリース未作成のため取得先は各自で用意する）
          npm install --global ./markdown-matrix-injector-0.3.0.tgz

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
| `expect-commit` | 空（未固定） | 期待するMMIのビルドcommit（小文字40桁） |
| `expect-lock-digest` | 空（未固定） | 期待する`package-lock.json`のdigest（`sha256:`＋64桁） |
| `expect-node-major` | 空（未固定） | MMIを動かすNode.jsの主版（例: `22`） |

`fail-on`の値:

- `diagnostics`: `mmi check`のエラー、または`provenance`の実行失敗。
- `stale`: 採用済みExtracted資産が現在の原本と一致しない。
- `review-stale`: Linked参照の論理表が、記録した見直し時点から変わっている。
- `missing`: 原本が見つからない、またはworkspace外。

既定では`stale`は失敗にしません。抽出資産の変更をレビューで確認する運用なら、`fail-on`へ`stale`を追加します。

## 検査に使ったMMIの版を固定する

Actionは、検査の前に`mmi --version --json`（`mmi.build-identity/v1`、#691）を実行し、commit・lockfile digest・Node.js主版・提供形態・未コミット変更の有無をサマリの「MMI build」に載せます。tarballの版番号（`0.3.0`）はコミットごとに変わらないため、同じ版番号でも中身が違い得ます。判定したMMIを追うには、この表を見ます。

`expect-*`を指定すると、指定した値が実際のMMIと食い違った時点で、検査を実行せずに失敗します。

```yaml
      - name: MMI check
        uses: hat47x/markdown-matrix-injector/.github/actions/mmi-check@main
        with:
          paths: docs
          expect-commit: 0123456789abcdef0123456789abcdef01234567
          expect-lock-digest: sha256:0000000000000000000000000000000000000000000000000000000000000000
          expect-node-major: 22
```

- 未指定の項目は照合しません。三つとも未指定のとき、サマリには「版は未固定」と出ます。固定は任意で、既定にはしていません。
- 指定した項目をMMIが返さない場合（識別を返さない古いtarball、`null`の項目）は、固定を確認できないため失敗にします。`expect-commit`を指定したとき、MMIが未コミットの変更つきでビルドされていた（`dirty: true`）場合も失敗にします。commitがそのビルドを指さないためです。
- 識別を取得できなかった場合（`mmi --version --json`が失敗する等）、指定がなければ検査は続き、サマリに取得失敗と理由を載せます。
- `mmi`入力が`npx`のように取得元の版が定まらない実行方法のとき、識別は`npx`が起動した版のものになります。取得元を固定していなければ、固定の照合は成功しても次の実行で別の版になり得ます。版を固定したい場合は、tarballを導入して`mmi`を使います。
- 固定に使う値は、`mmi --version --json`で確かめた値を利用者が控えます。固定版の正本をどのcommitにするかは、MMIでは決めていません。
- `--json`出力には、`build`と`versionPin`を加えています。

## 出力

GitHubのJob Summaryに次の表を出します。

- Markdown文書数、参照エラー数、診断数。
- 変更・staleになったExtracted資産の数と一覧。
- 見直しが必要なLinked参照の数と一覧。
- 原本なしの数。
- 失敗した条件（`Failed by: ...`）。
- 検査に使ったMMIのビルド識別と、版の固定の結果（上の節）。

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
