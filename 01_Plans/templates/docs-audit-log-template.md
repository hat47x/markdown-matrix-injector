# Docs Audit Log Template

## 0. Purpose
- docs audit の入力/出力/完了条件を毎回同一形式で記録し、feedback loop の追跡性を担保する。

## 1. Audit Operation Definition

### 1.1 Input
- 監査対象ドキュメント: `04_Documentation/...`
- 参照正本: `00_Prompt/requirements.md`, `02_Architecture/...`, `03_Implement/test/...`, `01_Plans/issues/...`
- 直近 triage 情報: `python3 01_Plans/tools/planning_queue.py` の出力

### 1.2 Output
- 本ログ（Audit Metadata / Findings / Classification / Closure）
- 分類済みフィードバック一覧（requirements / architecture / test / product gap）
- 各論点の反映先リンク（要件・設計・テスト・Issue/ADR/PR）

### 1.3 Definition of Done
- [ ] docs audit の監査対象・観点・結果が記録済み
- [ ] 全論点が requirements / architecture / test / product gap のいずれかに分類済み
- [ ] 未分類件数が 0
- [ ] 全論点に反映先リンクが設定済み
- [ ] 完了判定（Closed/Needs Follow-up）を記録済み

## 2. Audit Metadata
- Audit ID: `AUDIT-YYYYMMDD-XX`
- Date: `YYYY-MM-DD`
- Auditor: `(name/agent)`
- Iteration/Phase: `(e.g., Phase 6 weekly close)`
- Related Issue: `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`

## 3. Findings Log
| Finding ID | Observation | Evidence | Category | Action |
|---|---|---|---|---|
| F-001 | （記入） | （記入） | requirements | （記入） |
| F-002 | （記入） | （記入） | architecture | （記入） |
| F-003 | （記入） | （記入） | test | （記入） |
| F-004 | （記入） | （記入） | product gap | （記入） |
| F-XXX | （記入） | （記入） | 未分類 | （記入） |

## 4. Classification & Reflection
- 利用テンプレート: `01_Plans/templates/docs-feedback-classification-template.md`
- 反映先リンク:
  - requirements: `(path/url or N/A)`
  - architecture: `(path/url or N/A)`
  - test: `(path/url or N/A)`
  - product gap: `(path/url or N/A)`

## 5. Unclassified Gate
- 未分類件数: `___ 件`
- 判定: `PASS (0件) / FAIL (1件以上)`
- 対応メモ: `（未分類がある場合のみ記載）`

## 6. Closure
- 完了判定: `Closed / Needs Follow-up`
- 根拠: `Definition of Done の充足状況を記載`

## 7. Quick Usage (Short)
1. Input を埋める。
2. Findings を記録し、分類テンプレートで requirements / architecture / test / product gap へ割当。
3. 未分類をゼロ化し、反映先リンクを記入。
4. Closure を `Closed` にして保存。
