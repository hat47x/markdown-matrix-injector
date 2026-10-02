# ADR-0005: Phase 7 Release Readiness & Adoption Scale 運用方針

- Status: Accepted
- Date: 2026-03-31
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers

## Context (背景と課題)
- Phase 1〜6の実装・文書化が完了し、`01_Plans/tools/planning_queue.py` でもpending issue / ADRが0件となった。
- 現状は「機能はあるが、導入判定・回帰検知・運用観測」が散在し、公開後の品質維持を継続的に回す仕組みが弱い。
- 次段階では新機能追加よりも、リリース判断を自動化し、実利用での採用障壁を下げる運用基盤が必要。

## Decision (決定事項)
Phase 7を「Release Readiness & Adoption Scale」と定義し、以下の3ストリームを同時に推進する。

1) **Release gate automation**
- `docs-check` / `unit` / `integration` の最小合格ラインと、ドキュメント整合チェックをrelease gateとして明文化する。
- gate判定結果をissue単位で追跡できるよう、テンプレート化されたエビデンス書式を維持する。

2) **Adoption observability**
- query-evidence artifactを採用評価の一次データとして利用し、失敗理由・利用頻度を追跡可能にする。
- KPIは「導入時間短縮」「リンク不整合の早期検知」「印刷品質の再現性」に紐づく指標へ限定する。

3) **Feedback loop hardening**
- docs auditで発見した課題を `requirements` / `architecture` / `tests` / `issues` に還流するSLAを定義する。
- 仕様変更が不要な改善はissueで処理し、不可逆な方針変更のみADRを追加起票する。

## Consequences (結果と影響)
- メリット: 実装速度ではなく運用品質を最適化でき、公開後の不具合混入を減らせる。
- トレードオフ: 初期はドキュメントと検証タスクが増え、機能開発の見かけ速度は低下する。
- 受容理由: Phase 6までで主要機能は揃っており、次の価値は「安全に使い続けられる状態」の確立にあるため。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` (Phase 7追記)
- Related issue: `01_Plans/issues/issue-0043-phase7-release-readiness-foundation.md`
- Evidence command: `python3 01_Plans/tools/planning_queue.py`

## 議事録 (AI読込不要)
### Issue Definition
- 「Phase 6完了後に、次の優先投資先を機能追加と運用品質強化のどちらへ置くべきか」が未決定。

### Virtual Debate (Round 1)
- Architecture Lead: 継続運用のボトルネックは回帰検知。release gateの自動化が先。
- Product/UX Lead: 導入価値を示すには機能追加よりも、使い始めの失敗率低下が重要。
- QA/Delivery Lead: 受入条件の証跡粒度を統一しないと品質判断が属人化する。

### Synthesis & Decision
- 3ロール合意として、Phase 7は「運用品質の定着」を主目的に設定。
- 新機能はgate/observabilityを満たす範囲でのみ実施する方針を採択。
