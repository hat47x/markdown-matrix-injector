# Phase 10 Governance Reporting Foundation

Phase 10 の初回実装として、週次ガバナンスレポート生成のための **入力契約** と **最小CLI導線** を定義する。

## 1. KPI/SLA Input Contract (JSON)

入力は JSON オブジェクトで、以下の必須キーを持つ。

- `generatedAt` (string): レポート生成時刻（ISO 8601）
- `week` (object): 週次メタデータ
  - `label` (string): 週識別子（例: `2026-W15`）
  - `startDate` (string): 週開始日（`YYYY-MM-DD`）
  - `endDate` (string): 週終了日（`YYYY-MM-DD`）
- `kpis` (object): 週次KPI
  - `adoptionLeadTimeHours` (number): 導入リードタイム（時間）
  - `linkIntegrityDetectionRate` (number): リンク不整合検知率（%）
  - `printReproducibilityRate` (number): 印刷再現率（%）
  - `selfResolutionRate` (number): 問い合わせ自己解決率（%）
- `sla` (object): 改善SLA契約
  - `triageHours` (number): triage 期限（時間）
  - `workaroundHours` (number): workaround 期限（時間）
  - `fixHours` (number): fix 期限（時間）
  - `breaches` (array): 期限超過レコード
    - `ticketId` (string)
    - `stage` (string: triage/workaround/fix)
    - `elapsedHours` (number)
    - `owner` (string)
    - `note` (string)
- `nextActions` (array): 次アクション
  - `summary` (string)
  - `owner` (string)
  - `dueDate` (string, `YYYY-MM-DD`)
  - `source` (string)

サンプル: `04_Documentation/samples/phase10-governance-input.sample.json`

## 2. Weekly Report Markdown Template

`01_Plans/tools/phase10_governance_report.py` は入力契約を検証し、以下セクションを含む Markdown を出力する。

1. `Weekly Governance Report` ヘッダ（生成時刻・対象週）
2. `KPI Summary`（4 KPI の表形式要約）
3. `SLA Alerts`（triage/workaround/fix 目標値、違反チケット一覧）
4. `Next Actions`（翌週へ繰り越す実行項目）

## 3. Minimal CLI

```bash
python3 01_Plans/tools/phase10_governance_report.py \
  --input 04_Documentation/samples/phase10-governance-input.sample.json \
  --output artifacts/phase10-weekly-governance-report.md
```

期待結果:
- 正常入力: `OK: wrote governance report -> ...` と表示して終了コード `0`
- 必須キー不足/型不正: `NG: ...` と表示して終了コード `1`

## 4. Minimal Test Contract

`01_Plans/tools/test_phase10_governance_report.py` で以下を検証する。

- 必須キー不足時に `ValidationError` または CLI 終了コード `1` になる。
- 正常入力時に Markdown レポート生成が成功する。
- 出力Markdownに KPI/SLA/Next Actions の主要セクションが含まれる。
