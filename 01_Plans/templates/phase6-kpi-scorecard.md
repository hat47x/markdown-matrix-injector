# Phase 6 KPI Scorecard Template

## 1. KPI Definitions（issue-0020）

### KPI-1: TFS (Time-to-First-Success)
- **目的**: Tutorial 利用者が初回成功に到達するまでの時間を短縮する。
- **測定方法**: 記録した開始時刻〜成功判定時刻の差分（分）。
- **判定基準**:
  - Pass: 30分以内
  - Watch: 31〜45分
  - Fail: 46分以上

### KPI-2: Decision Readiness
- **目的**: 導入判断者が採用可否を文書のみで判断できる状態を担保する。
- **測定方法**: Scenario guide で「比較軸（利用前/利用後）・制約・適用条件」の3点が揃っているかを監査する。
- **判定基準**:
  - Pass: 3/3 が明示
  - Watch: 2/3 が明示
  - Fail: 0〜1/3

### KPI-3: Support Deflection
- **目的**: 問い合わせ一次回答を公開文書で自己完結させる。
- **測定方法**: 代表問い合わせに対し、Reference から「失敗時挙動・制約・関連正本リンク」へ到達できるかを確認する。
- **判定基準**:
  - Pass: 代表問い合わせの 80%以上で文書内解決
  - Watch: 50〜79%
  - Fail: 49%以下

### KPI-4: Feedback Closure
- **目的**: docs audit 起点の論点を上流へ確実に還流する。
- **測定方法**: 監査で抽出した論点数と、requirements / architecture / tests / issue へ分類・反映完了した件数を照合する。
- **判定基準**:
  - Pass: 反映率 100%
  - Watch: 80〜99%
  - Fail: 79%以下

---

## 2. Scorecard Entry Template

### Scorecard-<ID>
- **測定日**: YYYY-MM-DD
- **対象文書**: `<path/to/doc.md>`
- **KPI結果**:
  - TFS: `<実測値と判定>`
  - Decision Readiness: `<観測結果と判定>`
  - Support Deflection: `<観測結果と判定>`
  - Feedback Closure: `<観測結果と判定>`
- **判定**: `Pass | Watch | Fail`
- **次アクション**: `<次イテレーションで実施する改善>`
- **反映先リンク**:
  - requirements: `<path or N/A>`
  - architecture: `<path or N/A>`
  - tests: `<path or N/A>`
  - issue: `<path or N/A>`

---

## 3. Scorecard Sample (1 record)

### Scorecard-2026-03-24-001
- **測定日**: 2026-03-24
- **対象文書**: `04_Documentation/tutorial.md`
- **KPI結果**:
  - TFS: 27分（Pass）
  - Decision Readiness: 2/3（Watch）
  - Support Deflection: 83%（Pass）
  - Feedback Closure: 100%（Pass）
- **判定**: `Watch`
- **次アクション**: Scenario guide に「利用前/利用後」の比較表を追加し、Decision Readiness を 3/3 へ引き上げる。
- **反映先リンク**:
  - requirements: `00_Prompt/requirements.md`
  - architecture: `02_Architecture/phase6-public-documentation-architecture.md`
  - tests: `03_Implement/test/phase6-doc-audit-checklist.md`
  - issue: `01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md`
