# ADR-0006: Phase 8 Operational Reliability & Supportability 運用方針

- Status: Accepted
- Date: 2026-04-03
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers

## Context (背景と課題)
- `01_Plans/tools/planning_queue.py` の結果で pending issue / ADR は 0 件となり、Phase 7 の release gate automation は一巡した。
- 一方で公開後運用を想定すると、失敗時の切り分け時間、現場サポートの再現性、保守作業の属人化が次のボトルネックになる。
- 新機能を追加する前に、既存機能を「壊れた時に早く直せる状態」へ引き上げる運用設計が必要。

## Decision (決定事項)
Phase 8 を「Operational Reliability & Supportability」と定義し、以下の 5 ストリームを推進する。

1) **Failure triage automation**
- query-evidence / release-gate artifacts から、失敗分類（path/sheet/query/render/print）を自動要約する triage レポートを標準化する。
- issue 起票時に「再現手順・入力・期待値・実際値」をテンプレート化し、一次調査の往復回数を削減する。

2) **Support playbook hardening**
- 代表的な障害シナリオ（リンク切れ、巨大表フォールバック誤解、印刷崩れ）に対する runbook を整備し、SLA 付きの対応フローを定義する。
- docs 側の FAQ / troubleshooting と implementation 側の検証コマンドを1対1で紐づける。

3) **Regression prevention by contract tests**
- 運用で多発する失敗パターンを contract test として固定し、release gate で常時実行する。
- gate fail 時は「どの reader persona に影響するか」をレポートへ付与し、優先度判断を機械化する。

4) **Documentation usability & coverage uplift**
- triage / support 文書に対し、導線の見つけやすさ・記載の網羅性（前提、入力、期待値、制約）を quality gate として定点監査する。
- 「調査前に参照する最短リンク」「再現手順」「一次回避策」「恒久対策の記録先」を 1 ページで辿れる構成を標準化する。

5) **Support-driven product quality feedback**
- 問い合わせ分類・runbook 更新履歴・FAQ 追加理由を週次で集約し、requirements / architecture / tests / issues へ還流する。
- 文書更新だけでクローズせず、必要に応じて contract test 追加や要件補強まで完了させる。

6) **OSS table-pattern referencing for docs/test data**
- Drools の spreadsheet decision table（RuleSet/RuleTable）を参照し、設計文書で必要な表形式をパターンカタログ化する。
- 文書パターンとテストデータfixtureを同時管理し、説明資料と回帰検証の乖離を抑制する。

## Consequences (結果と影響)
- **Good:** 障害検知から修正着手までのリードタイムを短縮し、運用品質を定量管理できる。
- **Good:** サポート問い合わせ時の再現性が上がり、担当者依存を軽減できる。
- **Good:** ドキュメントの探索性・網羅性が向上し、自己解決率を継続的に改善できる。
- **Good:** 既存OSSで検証された表構造を再利用でき、設計文書・試験データの抜け漏れを抑えやすい。
- **Bad:** テスト資産・運用文書の更新コストが増える。
- **Bad:** 初期段階では新機能追加のスループットが一時的に低下する。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` (Phase 8 追記)
- Related issue: `01_Plans/issues/issue-0065-phase8-operational-reliability-foundation.md`
- Evidence command: `python3 01_Plans/tools/planning_queue.py`

## 議事録 (AI読込不要)
### Issue Definition
- Phase 7 完了後に、次の投資先を「機能追加」と「運用信頼性強化」のどちらへ置くべきかが未決定だった。

### Virtual Debate (Round 1)
- Architecture Lead: 実装面の新機能より、失敗分類と contract test 化を先に行う方が回帰コストを下げられる。
- Product/UX Lead: 採用拡大フェーズでは、問い合わせ時の回答速度と再現性が体験価値に直結する。
- QA/Delivery Lead: runbook と gate を接続しないと、障害時の対応品質が属人化する。

### Synthesis & Decision
- 3ロール合意として、Phase 8 は運用信頼性とサポート性を主軸に据える。
- 新機能は triage / playbook / contract test のガード下でのみ進める。
