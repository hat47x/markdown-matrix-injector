# Phase 10 Evidence Auto-harvest MVP

Phase 10の運用ガバナンス自動化に向けて、`docs-check` / `unit` / `integration` / `phase9-sync` の実行結果を共通JSONへ正規化する最小CLIを定義する。

## 1. Harvest Artifact Contract

`01_Plans/tools/phase10_evidence_harvest.py` の出力は以下を持つ。

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

既定値ルールは次のとおりです。
- `failure_category` 未指定時は `unknown`
- `impact_persona` 未指定時は `reviewer`

サンプル入力: `04_Documentation/samples/phase10-harvest-input.sample.json`

## 2. Minimal CLI

```bash
python3 01_Plans/tools/phase10_evidence_harvest.py \
  --inputs 04_Documentation/samples/phase10-harvest-input.sample.json \
  --output artifacts/phase10-evidence-harvest.json \
  --governance-output artifacts/phase10-governance-seed.json \
  --manual-kpis-file 04_Documentation/samples/phase10-manual-kpis.sample.json
```

`--output` を省略した場合は `query-evidence/phase10-evidence-harvest-<timestamp>.json` へ保存される。
`--manual-kpis-file` は省略可能で、`--governance-output` を指定した場合のみ意味を持つ。

期待結果は次のとおりです。
- 正常入力: `OK: wrote evidence harvest artifact -> ...` と表示して終了コード `0`
- 必須キー不足/列挙値不正: `NG: ...` と表示して終了コード `1`

## 3. Weekly Governance Input Contract との最小接続（v2 / ADR-0012 D6）

`build_governance_seed` ヘルパー（または `--governance-output`）により、収集済みartifactから
`phase10-governance-report/v2` 契約（`schemaVersion`, `generatedAt`, `week`, `kpis`, `kpisProvenance`, `sla`, `nextActions`）
を満たす最小JSONを生成できる。

ADR-0012 D6の3 KPI（`displacedDuplicationCount` / `canonDriftIncidentCount` / `tableChangeReviewLeadTimeHours`）は、
本ツールが自動計測する手段を持たない（週次で人手記録する運用を前提とする）。`--manual-kpis-file` に
`04_Documentation/samples/phase10-manual-kpis.sample.json` のようなJSONを渡すと、その値が `kpis` へマージされ、
`kpisProvenance` に `manual` として記録される。ファイル指定または個別フィールド省略時は `0` / `0.0` の
プレースホルダが入り、`kpisProvenance` に `unmeasured-default` として記録される — 「未計測」と「実測でゼロ」を
混同しないための明示的な区別である。

この接続は `01_Plans/tools/test_phase10_evidence_harvest.py` の最小統合テストで保証する。
