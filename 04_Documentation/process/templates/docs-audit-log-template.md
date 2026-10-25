# Docs Audit Log Template

## 0. Purpose
- docs audit の入力/出力/完了条件を毎回同一形式で記録し、feedback loop の追跡性を担保する。
- Gate C（docs audit + feedback 分類）の実行ログとして利用し、Gate D/E に必要な判定情報も残す。

## 1. Audit Operation Definition

### 1.0 Position in Gate Flow
- Gate A: 導線監査
- Gate B: Reference 品質監査
- **Gate C: docs audit + feedback 分類（本ログ）**
- Gate D: scorecard 記録
- Gate E: `planning_queue.py` 可視化

### 1.1 Input
- 監査対象ドキュメント: `04_Documentation/...`
- 参照正本: `00_Prompt/requirements.md`, `02_Architecture/...`, `03_Implement/test/...`, `04_Documentation/history/issues/...`
- 直近 triage 情報: `python3 03_Implement/tools/planning_queue.py` の出力
- 分類テンプレート: `04_Documentation/process/templates/docs-feedback-classification-template.md`

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

### 1.4 Timing（実施タイミング）
- 公開ドキュメントの新規追加/大幅改訂の直後
- イテレーション完了時（週次クローズ/マイルストーン）
- 仕様不整合・導線不明瞭・再現不能手順を検出した直後

## 2. Audit Metadata
- Audit ID: `AUDIT-YYYYMMDD-XX`
- 測定日: `YYYY-MM-DD`
- Auditor: `(name/agent)`
- Iteration/Phase: `(e.g., Phase 6 weekly close)`
- 対象文書: `04_Documentation/...`
- Related Issue: `04_Documentation/history/issues/issue-0019-phase6-feedback-loop-operations.md`

## 3. Findings Log
| Finding ID | Observation | Evidence | Category | Action |
|---|---|---|---|---|
| F-001 | （記入） | （記入） | requirements | （記入） |
| F-002 | （記入） | （記入） | architecture | （記入） |
| F-003 | （記入） | （記入） | test | （記入） |
| F-004 | （記入） | （記入） | product gap | （記入） |

> 運用ルール: `未分類` 行は監査中の一時メモに限定し、Closure 前に必ず `requirements / architecture / test / product gap` のいずれかへ再分類すること。

## 4. Classification & Reflection
- 利用テンプレート: `04_Documentation/process/templates/docs-feedback-classification-template.md`
- 反映先リンク:
  - requirements: `(path/url or N/A)`
  - architecture: `(path/url or N/A)`
  - test: `(path/url or N/A)`
  - product gap: `(path/url or N/A)`

## 5. Unclassified Gate
- 未分類件数: `___ 件`
- 判定: `PASS (0件) / FAIL (1件以上)`
- 次アクション: `FAIL の場合、再分類担当者と期限（YYYY-MM-DD）を記載`
- 対応メモ: `（未分類がある場合のみ記載）`

## 6. Closure
- 完了判定: `Closed / Needs Follow-up`
- 根拠: `Definition of Done の充足状況を記載`
- 反映先リンク:
  - requirements: `(path/url or N/A)`
  - architecture: `(path/url or N/A)`
  - test: `(path/url or N/A)`
  - product gap: `(path/url or N/A)`

## 7. Quick Usage (Short)
1. Input を埋める。
2. Findings を記録し、分類テンプレートで requirements / architecture / test / product gap へ割当。
3. 未分類をゼロ化し、反映先リンクを記入。
4. Closure を `Closed` にして保存。
