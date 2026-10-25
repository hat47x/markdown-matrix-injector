# ADR-0007: Phase 9 Rule Table Interoperability & Design Assetization 方針

- Status: Accepted
- Date: 2026-04-03
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers

## Context (背景と課題)
- Phase 8で運用信頼性とDrools参照パターンの整理は完了したが、現状は「文書で説明できる」段階に留まり、再利用可能なテンプレート資産としては未成熟。
- 設計文書とtest fixtureの同期運用が手作業だと、採用現場でフォーマット差分・列不足・追跡漏れが再発しやすい。
- 次段階では、表パターンを実データテンプレートとして固定し、相互運用検証を継続できる基盤が必要。

## Decision (決定事項)
Phase 9を「Rule Table Interoperability & Design Assetization」と定義し、以下の4ストリームを推進する。

1) Template productization
- Drools参照の文書パターンをCSV/XLSXの配布テンプレートへ落とし込み、利用者が即時再利用できる状態を作る。
- テンプレートには説明列（用途、制約、更新責任）を同梱し、導入時の解釈差を抑える。

2) Interoperability validation bundle
- RuleSet相当メタ、RuleTable相当条件/アクション、属性列（priority/effective/expires）を含むベンチマークデータを標準fixture化する。
- `columns`/`grep`/`header`/`mode` など既存クエリでの可観測性を必須条件にする。

3) Round-trip sync governance
- 文書テンプレート更新時にtest fixtureも同時更新する運用を必須化し、逆方向（fixture起点）の不足も文書へ還流する。
- 片側のみ更新を禁止し、差分があればissueで追跡する。

4) Adoption benchmark operation
- SIer設計文書で頻出する4表（要件トレーサビリティ、状態遷移、障害切り分け、リリース判定）を最小ベンチマークに固定する。
- ベンチマーク実行時間と初期導入失敗率をKPIとして観測し、Phase 7/8の運用KPIと接続する。

## Consequences (結果と影響)
- **Good:** 設計文書と試験資産のフォーマット互換が向上し、採用現場での初期整備工数を削減できる。
- **Good:** 文書改善と回帰検証が同時に進み、品質改善サイクルの遅延を抑制できる。
- **Bad:** テンプレートの維持管理（列定義、サンプル更新）の運用負荷が増える。
- **Bad:** ベンチマークKPI収集のため、初期は計測運用コストが追加される。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` (Phase 9追記)
- Related issue: `04_Documentation/history/issues/issue-0066-phase9-rule-table-template-foundation.md`
- Evidence command: `python3 03_Implement/tools/planning_queue.py`

## 議事録 (AI読込不要)
### Issue Definition
- Phase 8で整理したパターンを、このまま運用し続けるか、テンプレート資産として正式運用へ昇格させるかが未決定だった。

### Virtual Debate (Round 1)
- Architecture Lead: fixtureと文書の同期を制度化しないと、次の機能拡張で回帰観点が断絶する。
- Product/UX Lead: 導入現場は「すぐ使えるテンプレート」を必要としており、説明文書だけでは採用障壁が残る。
- QA/Delivery Lead: ベンチマークセットを固定しないと、観測指標が毎回ぶれて品質比較が成立しない。

### Synthesis & Decision
- 3ロール合意として、Phase 9はテンプレート資産化と相互運用検証の固定化を主軸に進める。
- 変更はdocs onlyで閉じず、fixture同期とKPI観測導線を同時に整備する。
