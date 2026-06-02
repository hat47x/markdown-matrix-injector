# Phase 10 Evidence Auto-harvest MVP

Phase 10 の運用ガバナンス自動化に向けて、`docs-check` / `unit` / `integration` / `phase9-sync` の実行結果を共通JSONへ正規化する最小CLIを定義する。

## 1. Harvest Artifact Contract

`01_Plans/tools/phase10_evidence_harvest.py` の出力は以下を持つ。

- `generatedAt` (string): 収集時刻（ISO 8601）
- `schemaVersion` (string): 契約バージョン（`phase10-evidence-harvest/v1`）
- `recordCount` (number): 収集件数
- `records` (array): 正規化結果
  - `source` (string): 入力ソース識別子
  - `gate` (string): gate 名（docs-check/unit/integration/phase9-sync など）
  - `status` (string): pass/fail 等の状態
  - `failure_category` (string): `path|sheet|query|render|print|unknown`
  - `impact_persona` (string): `author|reviewer|delivery`
  - `collected_at` (string): レコード単位収集時刻

既定値ルール:
- `failure_category` 未指定時は `unknown`
- `impact_persona` 未指定時は `reviewer`

サンプル入力: `04_Documentation/samples/phase10-harvest-input.sample.json`

## 2. Minimal CLI

```bash
python3 01_Plans/tools/phase10_evidence_harvest.py \
  --inputs 04_Documentation/samples/phase10-harvest-input.sample.json \
  --output artifacts/phase10-evidence-harvest.json \
  --governance-output artifacts/phase10-governance-seed.json
```

`--output` を省略した場合は `query-evidence/phase10-evidence-harvest-<timestamp>.json` へ保存される。

期待結果:
- 正常入力: `OK: wrote evidence harvest artifact -> ...` と表示して終了コード `0`
- 必須キー不足/列挙値不正: `NG: ...` と表示して終了コード `1`

## 3. Weekly Governance Input Contract との最小接続

`build_governance_seed` ヘルパー（または `--governance-output`）により、収集済みartifactから issue-0084 で定義した週次レポート入力契約（`generatedAt`, `week`, `kpis`, `sla`, `nextActions`）を満たす最小JSONを生成できる。

この接続は `01_Plans/tools/test_phase10_evidence_harvest.py` の最小統合テストで保証する。
