# Issue: Phase 7のリリース判定にタイムアウトとテスト省略の指定を加える

この文書は、Phase 7当時のリリース判定コマンドに追加したタイムアウトと明示的なスキップの扱いを残したIssue記録です。スキップはG2を実施済みとするものではありません。2026年4月2日の検証結果を現在の実行確認へ読み替えないでください。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_check.py`, `01_Plans/tools/test_release_gate_check.py`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定のCLIにタイムアウトの指定と、文書のみを対象とする検証（docs-only）向けのスキップ指定を追加する。コマンドが応答しない状態や長時間の待機に対応できるようにする。
- 単体テスト（unittest）を拡張し、追加した指定と、コマンドが見つからない場合（command-not-found）の動作を検証する。

### 受入条件（Acceptance criteria）
- [x] `--planning-timeout-sec` と `--npm-test-timeout-sec` が利用できる。
- [x] `--skip-tests` が利用でき、G2を明示スキップとして記録できる。
- [x] command-not-foundをreturncode 127として扱うテストが存在する。
- [x] `python3 -m unittest 01_Plans/tools/test_release_gate_check.py` が成功する。

### 作業項目（Task breakdown）
- [x] release gate CLIにtimeout / skipパラメータを追加する。
- [x] run_commandの例外処理（not found / timeout）を実装する。
- [x] unittestを更新する。
- [x] 運用ドキュメントへ新オプションの使い分けを追記する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/release_gate_check.py --format json`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/release_gate_check.py --format json`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate CLIにtimeout/skipオプションを追加。
  - unittestを9ケースへ拡張し、新オプションと異常系を固定。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
