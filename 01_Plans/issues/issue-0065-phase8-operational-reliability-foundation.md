# Issue: Phase 8 Operational Reliability foundation

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `00_Prompt/requirements.md`, `01_Plans/adr/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 8 Operational Reliability & Supportability
- Related ADR/Spec: `01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Phase 8 の初回イテレーションとして、運用信頼性の評価軸（triage速度・support再現性・回帰予防）を文書と運用手順へ反映する。
- 実装の新機能追加は後段とし、まず release gate と support playbook の接続を定義する。
- 併せて、運用ドキュメントの利便性（導線・検索性）と網羅性（再現に必要な記述要素）を明文化し、サポート知見が製品品質へ還流する流れを固定化する。

### Acceptance criteria (受入条件)
- [ ] `00_Prompt/requirements.md` に Phase 8 の目的と対象が追記される。
- [ ] `04_Documentation/` に triage / runbook / contract test 導線を含む運用ガイドが追加される。
- [ ] Issue テンプレート運用に再現手順（入力・期待値・実際値）を残すルールが明文化される。
- [ ] Phase 8 ガイドに、ドキュメント利便性（最短導線・検索性）と網羅性（前提・入力・期待値・制約）の監査観点が含まれる。
- [ ] support で得た知見を requirements / architecture / tests / issue へ還流する手順が定義される。
- [ ] Drools の spreadsheet decision table 書式を参照した設計文書/テストデータのパターン抽出が文書化される。
- [ ] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [ ] Phase 8 要件を requirements に反映する。
- [ ] Phase 8 運用ガイド（triage + support runbook + contract test）を追加する。
- [ ] 運用ガイドへ「文書利便性・網羅性チェック」と「製品品質への還流手順」を追加する。
- [ ] Drools 参照の表パターンカタログとサンプルデータ（docs/test）を追加する。
- [ ] planning queue を再実行し整合性を確認する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-03: `python3 01_Plans/tools/planning_queue.py` を実行し、`orphan issue: 0` を確認。
- 2026-04-03: Drools 参照パターンとして `04_Documentation/phase8-drools-inspired-table-patterns.md` と対応 CSV サンプル（docs/test fixture）を追加。
