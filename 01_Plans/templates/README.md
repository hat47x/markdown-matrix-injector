# Templates

このディレクトリは、`01_Plans` で再利用する運用テンプレートを格納する。

## Available templates
- `docs-audit-feedback-loop-template.md`
  - docs audit の定常運用（feedback loop）で使用する記録テンプレート。
  - 分類: requirements / architecture / test / product gap / 未分類
## docs audit 運用の適用順序（Gate）
1. Gate A: Overview → Tutorial → Scenario → Reference の導線監査
2. Gate B: Reference 品質監査
3. Gate C: docs audit + feedback 分類
4. Gate D: scorecard 記録（`phase6-kpi-scorecard*.md`）
5. Gate E: `python3 01_Plans/tools/planning_queue.py` による triage 可視化

## Gate C の入出力
- Input:
  - 監査対象ドキュメント（主に `04_Documentation/*`）
  - 参照正本（`00_Prompt/requirements.md`, `02_Architecture/*`, `03_Implement/test/*`, `01_Plans/issues/*`）
  - triage 出力（`python3 01_Plans/tools/planning_queue.py`）
- Output:
  - docs audit 記録
  - feedback 分類表（requirements / architecture / test / product gap / 未分類）
  - 反映先リンク付きアクション
  - 完了判定（Closed / Needs Follow-up）

## Available templates
- `docs-audit-feedback-loop-template.md`
  - Gate C の主テンプレート（実施タイミング、入力、出力、完了条件、監査記録）。
- `docs-feedback-classification-template.md`
  - Gate C の分類テンプレート（未分類ゲートを含む）。
- `docs-audit-log-template.md`
  - 1回ごとの監査ログテンプレート（Findings / Classification / Closure）。
- `docs-audit-log-sample-iteration-template.md`
  - 1回分サンプル記録の雛形（運用開始時のコピー元）。
  - Gate C 単体運用チェック用。1回分の監査をこのファイルだけで起票・記録できる。
