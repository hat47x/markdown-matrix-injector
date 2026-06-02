# ADR-0009: Phase 10 採用運用ガバナンス自動化方針

- Status: Accepted
- Date: 2026-04-11
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers

## Context (背景と課題)
- Phase 9 まででテンプレート同期ゲートと観測導線は整備されたが、運用実績を継続的に集計し改善優先度へ接続する共通オペレーションが不足している。
- docs audit / support runbook / release gate の成果物が分散し、週次での説明責任（何を直し、何を延期し、誰が責任を持つか）が追跡しづらい。
- 採用拡大フェーズでは「品質が高い」だけでなく「品質改善が継続的に回る」ことを示すガバナンス基盤が必要である。

## Decision (決定事項)
Phase 10 を「採用運用ガバナンス自動化」と定義し、運用エビデンスの収集・集計・起票連携を標準化する。

1) **Evidence auto-harvest の標準化**
- `docs-check` / `unit` / `integration` / `phase9-sync` の結果を定期収集し、失敗分類（path/sheet/query/render/print）と影響読者（author/reviewer/delivery）を付与する。
- 収集フォーマットは機械可読（JSON）を正本とし、レポート用途で Markdown 要約を生成する。

2) **SLA 監視可能な運用メタデータ導入**
- docs/support 改善タスクに triage 期限・暫定回避策期限・恒久対策期限を必須メタデータとして付与する。
- 期限超過は週次レポートに警告として出力し、継続的に backlog 優先度へ反映する。

3) **Weekly governance report の運用導線整備**
- 導入時間、リンク不整合検知率、印刷再現性、問い合わせ自己解決率の4指標を最低限のKPIとして週次で出力する。
- KPI逸脱時は issue 起票候補を自動抽出し、不可逆方針のみADRへエスカレーションする。

4) **段階導入 (Issue分割) 方針**
- 初回イテレーションでは「KPI入力データの契約」と「週次レポート雛形」を先に固定する。
- その後に自動収集、SLA検知、起票連携を段階的に追加する。

## Consequences (結果と影響)
- **Good:** 改善活動が属人的な口頭運用から、追跡可能な運用ガバナンスへ移行できる。
- **Good:** 失敗分類と影響読者が結びつくことで、優先度判断の再現性が向上する。
- **Good:** docs/support/release の分断を減らし、要件・設計・テストへの還流が速くなる。
- **Bad:** KPI整備初期は計測項目定義とデータ整備コストが増える。
- **Bad:** 運用メタデータの入力ルールを徹底しないと、レポート精度が揺らぐ。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` (Phase 10)
- Related issue: `01_Plans/issues/issue-0084-phase10-governance-reporting-foundation.md`
- Evidence command: `python3 01_Plans/tools/planning_queue.py`

## 議事録 (AI読込不要)
### Issue Definition
- Phase 10 を「運用改善を継続できる状態」にするため、どこから標準化するか（計測・SLA・起票連携の優先順位）が未決定。

### Virtual Debate (Round 1)
- Architecture Lead: まず入力データ契約がないと自動化は壊れやすい。KPI定義とフォーマット固定を先行すべき。
- Product/UX Lead: 利用者価値としては、週次で何が改善されたかが見えることが重要。可読なレポート雛形が必要。
- QA/Delivery Lead: SLA期限をメタデータ化しないと、運用遅延を検知できない。最低限の期限項目は必須。

### Synthesis & Decision
- 3ロール合意として、Phase 10 初回は「KPI入力契約 + 週次レポート雛形 + SLAメタデータ必須化」を固定し、次Issueから自動収集と検知を段階追加する。
- requirements の拡張とADR/Issue起票で実施可能であり、要件根幹の破壊は伴わないため人間承認待ちは不要と判断。
