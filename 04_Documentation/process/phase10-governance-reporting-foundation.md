# Phase 10 Governance Reporting Foundation

Phase 10の初回実装として、週次ガバナンスレポート生成のための **入力契約** と **最小CLI導線** を定義する。

## 1. KPI/SLA Input Contract (JSON)

入力はJSONオブジェクトで、以下の必須キーを持つ（`schemaVersion: phase10-governance-report/v2`）。

- `schemaVersion` (string): 契約バージョン。`phase10-governance-report/v2` 固定。
- `generatedAt` (string): レポート生成時刻（ISO 8601）
- `week` (object): 週次メタデータ
  - `label` (string): 週識別子（例: `2026-W15`）
  - `startDate` (string): 週開始日（`YYYY-MM-DD`）
  - `endDate` (string): 週終了日（`YYYY-MM-DD`）
- `kpis` (object): 週次KPI（ADR-0012 D6で再定義）
  - `displacedDuplicationCount` (number): 駆逐されたコピー重複（件数、週次）
  - `canonDriftIncidentCount` (number): 正本と文書の乖離インシデント（件数、週次）
  - `tableChangeReviewLeadTimeHours` (number): 表変更のレビュー所要時間（時間、週次中央値）
- `sla` (object): 改善SLA契約
  - `triageHours` (number): triage期限（時間）
  - `workaroundHours` (number): workaround期限（時間）
  - `fixHours` (number): fix期限（時間）
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

`01_Plans/tools/phase10_governance_report.py` は入力契約を検証し、以下セクションを含むMarkdownを出力する。

1. `Weekly Governance Report` ヘッダ（生成時刻・対象週）
2. `KPI Summary`（3 KPIの表形式要約）
3. `SLA Alerts`（triage/workaround/fix目標値、違反チケット一覧）
4. `Next Actions`（翌週へ繰り越す実行項目）

## 2.1 Migration from v1 (ADR-0012 D6)

v1（`adoptionLeadTimeHours` / `linkIntegrityDetectionRate` / `printReproducibilityRate` / `selfResolutionRate`）から
v2への移行は破壊的変更である。旧フィールド名が `kpis` に含まれる入力は明示的な `ValidationError`（`legacy field(s) ...`）
で拒否される。移行手順:

1. `schemaVersion` を `phase10-governance-report/v2` に更新する。
2. `kpis` を新3フィールドへ置き換える。
3. 実測値が未計測の週は `0` / `0.0` を入れ、後述の `--manual-kpis-file`（`phase10_evidence_harvest.py`）経由で
   `kpisProvenance` に `unmeasured-default` として記録する運用に切り替える。

詳細な決定根拠は `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md` D6を参照。

## 3. Minimal CLI

```bash
python3 01_Plans/tools/phase10_governance_report.py \
  --input 04_Documentation/samples/phase10-governance-input.sample.json \
  --output artifacts/phase10-weekly-governance-report.md
```

期待結果は次のとおりです。
- 正常入力: `OK: wrote governance report -> ...` と表示して終了コード `0`
- 必須キー不足/型不正: `NG: ...` と表示して終了コード `1`

## 4. Minimal Test Contract

`01_Plans/tools/test_phase10_governance_report.py` で以下を検証する。

- 必須キー不足時に `ValidationError` またはCLI終了コード `1` になる。
- 正常入力時にMarkdownレポート生成が成功する。
- 出力MarkdownにKPI/SLA/Next Actionsの主要セクションが含まれる。
