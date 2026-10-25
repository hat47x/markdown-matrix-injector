# Issue: リリース判定のタイムアウト処理をテストし出力末尾の改行を整える

この文書は、当時のタイムアウト分岐の単体テストと、成果物ファイルの末尾改行の正規化を扱ったIssue記録です。2026年4月2日の検証証跡は当時の実行結果であり、現在のスクリプト動作を新たに確認したものではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/release_gate_check.py`, `03_Implement/tools/test_release_gate_check.py`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定の補助処理（helper）について、タイムアウト時の分岐を単体テスト（unittest）で確認する。あわせて、成果物（artifact）をファイルに書き出す際は末尾の改行を1回にそろえる。

### 受入条件（Acceptance criteria）
- [x] `run_command` のtimeout分岐がunittestで検証される。
- [x] `write_output_file` が末尾改行を重複させない。
- [x] 追加テストを含め `python3 -m unittest 03_Implement/tools/test_release_gate_check.py` が成功する。

### 作業項目（Task breakdown）
- [x] newline正規化ヘルパーを追加する。
- [x] timeout/改行正規化のunittestを追加する。
- [x] 実行結果をValidation evidenceに記録する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 03_Implement/tools/test_release_gate_check.py`
- `python3 03_Implement/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json --output-markdown-file artifacts/release-gate.md`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 03_Implement/tools/test_release_gate_check.py`
  - `python3 03_Implement/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json --output-markdown-file artifacts/release-gate.md`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - timeout分岐のunittestを追加し、run_commandの124戻り値を固定。
  - artifact出力で末尾改行を1回に正規化。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
