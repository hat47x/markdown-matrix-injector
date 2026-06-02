# Phase 6 KPI Scorecard Template

issue-0020（Phase 6 Value KPI and Audit Scorecard）で定義された KPI を反復計測するためのテンプレート。

## 1) KPI定義（4項目）

### KPI-1: TFS（Time-to-First-Success）
- **目的**: 初見ユーザーが最初の成功体験に到達するまでの時間を短縮する。
- **測定方法**: 開始時刻〜成功判定時刻の差分（分）。
- **判定基準**:
  - Pass: 30分以内
  - Watch: 31〜45分
  - Fail: 46分以上

### KPI-2: Decision Readiness
- **目的**: 導入判断者が文書のみで採用可否を判断できる状態を維持する。
- **測定方法**: 対象シナリオに「利用前/利用後の比較」「適用条件」「制約」が揃っているかを監査する。
- **判定基準**:
  - Pass: 3/3
  - Watch: 2/3
  - Fail: 0〜1/3

### KPI-3: Support Deflection
- **目的**: 問い合わせの一次回答を公開文書のみで完結できる状態を高める。
- **測定方法**: 代表問い合わせに対して、Reference だけで回答完結できた割合（%）を記録する。
- **判定基準**:
  - Pass: 80%以上
  - Watch: 50〜79%
  - Fail: 49%以下

### KPI-4: Feedback Closure
- **目的**: docs audit 起点の指摘を上流文書へ確実に還流する。
- **測定方法**: 監査指摘件数に対する、反映済み件数（requirements / architecture / tests / issue）の比率（%）を記録する。
- **判定基準**:
  - Pass: 100%
  - Watch: 80〜99%
  - Fail: 79%以下

---

## 2) Scorecard記録テンプレート

以下を1計測につき1ブロック追加する。

### Scorecard-<YYYYMMDD-SEQ>
- **測定日**: YYYY-MM-DD
- **対象文書**: `<path/to/doc.md>`

| KPI | 実測・観測結果 | 判定 (Pass/Watch/Fail) | 根拠メモ |
|---|---|---|---|
| TFS | `<例: 28分>` | `<Pass>` | `<開始・終了時刻や補足>` |
| Decision Readiness | `<例: 2/3>` | `<Watch>` | `<不足要素>` |
| Support Deflection | `<例: 82%>` | `<Pass>` | `<問い合わせ母数と内訳>` |
| Feedback Closure | `<例: 100%>` | `<Pass>` | `<反映済み件数/総件数>` |

- **判定**: `Pass | Watch | Fail`
- **次アクション**: `<改善タスクを1〜3件>`
- **反映先リンク**:
  - requirements: `<path or N/A>`
  - architecture: `<path or N/A>`
  - tests: `<path or N/A>`
  - issue: `<path or N/A>`

#### 必須入力チェック（記入漏れ防止）
- [ ] `測定日` を記入した
- [ ] `対象文書` を記入した
- [ ] 4 KPI（TFS / Decision Readiness / Support Deflection / Feedback Closure）を全て記録した
- [ ] `判定` を記入した
- [ ] `次アクション` を記入した（Watch / Fail を含む場合は必須）
- [ ] `反映先リンク`（requirements / architecture / tests / issue）を記入した（N/A 可）

---

## 3) スコアカード運用手順（要約）

1. docs更新単位（例: issue完了時）で 1 件計測する。
2. 対象文書を決め、4 KPI を同日に記録する。
3. 判定が Watch/Fail の KPI について次アクションを必ず記載する。
4. 反映先リンクへ requirements / architecture / tests / issue を紐付ける。
5. 次回計測で前回の次アクション消化有無を確認し、継続改善を回す。

> 実例は `01_Plans/templates/phase6-kpi-scorecard-sample.md` を参照。
