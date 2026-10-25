# Phase 10 Evidence Auto-harvest MVP

Phase 10の運用ガバナンス自動化に向けて、`docs-check` / `unit` / `integration` / `phase9-sync` の実行結果を共通JSONへ正規化する最小CLIの仕様と手順を説明します。このCLIは、入力として渡された実行結果を整理するもので、各検査そのものを実行するものではありません。

## 1. Harvest Artifact Contract

`03_Implement/tools/phase10_evidence_harvest.py` は、収集した結果を次の項目を持つJSONとして出力します。

- `generatedAt` (string): 収集時刻（ISO 8601）
- `schemaVersion` (string): 契約バージョン（`phase10-evidence-harvest/v1`）
- `recordCount` (number): 収集件数
- `records` (array): 正規化結果
  - `source` (string): 入力ソース識別子
  - `gate` (string): gate名（docs-check/unit/integration/phase9-syncなど）
  - `status` (string): pass/fail等の状態
  - `failure_category` (string): `path|sheet|query|render|print|unknown`
  - `impact_persona` (string): `author|reviewer|delivery`
  - `collected_at` (string): レコード単位収集時刻

入力レコードで指定がない場合は、次の既定値を使います。
- `failure_category` 未指定時は `unknown`
- `impact_persona` 未指定時は `reviewer`

サンプル入力: `04_Documentation/samples/phase10-harvest-input.sample.json`

## 2. Minimal CLI

リポジトリのルートディレクトリで、次のコマンドを実行する例です。サンプル入力から証跡JSONと週次ガバナンスレポート用の入力JSONを生成します。

```bash
python3 03_Implement/tools/phase10_evidence_harvest.py \
  --inputs 04_Documentation/samples/phase10-harvest-input.sample.json \
  --output artifacts/phase10-evidence-harvest.json \
  --governance-output artifacts/phase10-governance-seed.json \
  --manual-kpis-file 04_Documentation/samples/phase10-manual-kpis.sample.json
```

`--output` を省略した場合は `query-evidence/phase10-evidence-harvest-<timestamp>.json` へ保存される。
`--manual-kpis-file` は省略可能で、`--governance-output` を指定した場合のみ意味を持つ。

以下はコマンドの期待動作です。今回の文章修正に伴い、実際にコマンドを再実行した結果ではありません。
- 正常入力: `OK: wrote evidence harvest artifact -> ...` と表示して終了コード `0`
- 必須キー不足/列挙値不正: `NG: ...` と表示して終了コード `1`

## 3. Weekly Governance Input Contract との最小接続（v2 / ADR-0012 D6）

`build_governance_seed` ヘルパー（または `--governance-output`）により、収集済みartifactから
`phase10-governance-report/v2` 契約（`schemaVersion`, `generatedAt`, `week`, `kpis`, `kpisProvenance`, `sla`, `nextActions`）
を満たす最小JSONを生成できます。ここで生成されるのは週次レポートに渡すための入力データであり、週次の業務実績を自動的に確定するものではありません。

ADR-0012 D6の3 KPI（`displacedDuplicationCount` / `canonDriftIncidentCount` / `tableChangeReviewLeadTimeHours`）は、
本ツールが自動計測する手段を持たない（週次で人手記録する運用を前提とする）。`--manual-kpis-file` に
`04_Documentation/samples/phase10-manual-kpis.sample.json` のようなJSONを渡すと、その値が `kpis` へマージされ、
`kpisProvenance` に `manual` として記録される。ファイル指定または個別フィールド省略時は `0` / `0.0` の
プレースホルダが入り、`kpisProvenance` に `unmeasured-default` として記録される — 「未計測」と「実測でゼロ」を
混同しないための明示的な区別です。未計測のプレースホルダ値は、実際の測定結果がゼロだったという意味ではありません。

この接続は `03_Implement/tools/test_phase10_evidence_harvest.py` の最小統合テストで保証する。
