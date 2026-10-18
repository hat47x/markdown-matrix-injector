# Issue: Phase 9の同期検査でI/Oエラー時のCLI応答を定める

この文書は、同期検査のCLIでI/Oエラーが起きた場合の応答を検証対象に加える、当時のIssue記録です。検証証跡には実行日が記載されておらず、現行のエラー処理を新たに確認したものではありません。

## Meta
- Type: Tooling
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `check_phase9_template_sync.py`のCLI失敗時の契約に、ディレクトリをファイルとして指定した場合などの`OSError`系のエラーを加える。I/Oエラーが発生した場合も、終了コード1と構造化されたエラー出力を返すようにする。

### 受入条件（Acceptance criteria）
- [x] CLIメイン処理が `OSError` を捕捉して `phase9 template sync: NG`（またはJSON `status=ng`）を返す。
- [x] ディレクトリパス指定時のテキスト出力契約テストが追加される。
- [x] ディレクトリパス指定時のJSON出力契約テストが追加される。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] CLIの例外処理に `OSError` を追加する。
- [x] CLI契約テストを2件追加する（text/json）。
- [x] テストとplanning queueを実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 21 tests in 0.895s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
