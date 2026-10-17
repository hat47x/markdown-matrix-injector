# Issue: Phase 8の運用信頼性とサポート体制の基盤を整理する

この文書は、Phase 8当時の運用信頼性とサポート体制の初期計画を残したIssue記録です。Metaの`Status: Done`に対し、受入条件と作業項目は未チェックのままです。双方を原文どおり維持し、完了判定の妥当性や現行の動作を新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `00_Prompt/requirements.md`, `01_Plans/adr/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 8 Operational Reliability & Supportability
- Related ADR/Spec: `01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Phase 8の初回作業では、問題の切り分け（triage）の速さ、サポート対応の再現性、不具合の再発防止という運用信頼性の評価観点を文書と運用手順に反映する。
- 新機能の実装は後続の作業とし、まずリリース判定（release gate）とサポート手順書（support playbook）の関係を定義する。
- あわせて、運用文書の探しやすさ（導線・検索性）と、再現に必要な情報が揃っているか（網羅性）を確認する観点を明文化する。サポートで得た知見を製品品質の改善へ戻す流れも定める。

### 受入条件（Acceptance criteria）
- [ ] `00_Prompt/requirements.md` にPhase 8の目的と対象が追記される。
- [ ] `04_Documentation/` にtriage / runbook / contract test導線を含む運用ガイドが追加される。
- [ ] Issueテンプレート運用に再現手順（入力・期待値・実際値）を残すルールが明文化される。
- [ ] Phase 8ガイドに、ドキュメント利便性（最短導線・検索性）と網羅性（前提・入力・期待値・制約）の監査観点が含まれる。
- [ ] supportで得た知見をrequirements / architecture / tests / issueへ還流する手順が定義される。
- [ ] Droolsのspreadsheet decision table書式を参照した設計文書/テストデータのパターン抽出が文書化される。
- [ ] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [ ] Phase 8要件をrequirementsに反映する。
- [ ] Phase 8運用ガイド（triage + support runbook + contract test）を追加する。
- [ ] 運用ガイドへ「文書利便性・網羅性チェック」と「製品品質への還流手順」を追加する。
- [ ] Drools参照の表パターンカタログとサンプルデータ（docs/test）を追加する。
- [ ] planning queueを再実行し整合性を確認する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-03: `python3 01_Plans/tools/planning_queue.py` を実行し、`orphan issue: 0` を確認。
- 2026-04-03: Drools参照パターンとして `04_Documentation/phase8-drools-inspired-table-patterns.md` と対応CSVサンプル（docs/test fixture）を追加。
