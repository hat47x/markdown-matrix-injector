# ADR-0008: Phase 9 テンプレート同期 Quality Gate Hardening 方針

- Status: Accepted
- Date: 2026-04-03
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers

## Context (背景と課題)
- Phase 9初回実装（issue-0066）でテンプレート運用ガイドとベンチマークCSVは整備されたが、同期監査は「ヘッダ一致」のみであり、データ品質（必須列空欄、RuleId重複、日付形式逸脱）の検知が不足している。
- `markdownMatrixPlugin` の観測テストは1ケース追加済みだが、ベンチマーク4表を横断したcontract testには到達していない。
- テンプレートが資産化されても、品質ゲートが弱いと運用中に劣化し、docs/fixture同期ルールの信頼性が低下する。

## Decision (決定事項)
Phase 9の次イテレーションでは、テンプレート同期を「列一致」から「品質監査付き同期」へ拡張する。

1) Sync checkerの監査項目拡張
- ヘッダ一致に加えて、`RuleId` 一意性、必須列非空、`EffectiveFrom/ExpiresAt` の `YYYY-MM-DD` 妥当性を検査する。
- 失敗時は監査項目別にエラーを列挙し、終了コード1で停止する。

2) Benchmark contract testsの追加
- `columns` / `grep` / `header` の組み合わせを4ベンチマーク表それぞれに割り当てたtest caseを追加し、観測回帰を検知する。
- Smart Fallbackしきい値影響を避けるため `mode=table` を明示し、観測意図を固定する。

3) 運用導線の再固定
- `phase9-rule-table-template-operations.md` に「品質監査付き同期」の手順を追記し、READMEのPhase 9導線と整合させる。
- 監査観点追加はissueで追跡し、不可逆な列仕様変更が必要な場合のみ次ADRへエスカレーションする。

4) Coverage/Pattern governance
- Phase 9の品質ゲートでは、テストカバレッジ向上（正常系/異常系/境界値）とテストパターン資産化（table別・query別・失敗種別別）を継続要件として扱う。
- 追加パターンはrequirementsのPhase 9へ還流し、issueで追跡可能に維持する。

## Consequences (結果と影響)
- **Good:** 同期監査が運用品質（可読性・検証性・追跡性）をより直接的に担保できる。
- **Good:** docs/fixture の見かけ上の一致（ヘッダだけ一致）を早期に排除し、回帰を自動検知できる。
- **Good:** テストパターンが資産化され、次イテレーションの追加コストと見落としを抑制できる。
- **Bad:** 監査項目追加に伴い、テンプレート更新時の修正コストが一時的に増える。
- **Bad:** 初期段階では監査エラーの分類・メッセージ改善に追加運用が必要となる。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` (Phase 9)
- Related issue: `01_Plans/issues/issue-0067-phase9-template-sync-quality-gate-hardening.md`
- Previous issue: `01_Plans/issues/issue-0066-phase9-rule-table-template-foundation.md`
- Evidence command: `python3 01_Plans/tools/planning_queue.py`

## 議事録 (AI読込不要)
### Issue Definition
- Phase 9基盤実装のまま運用を継続するか、品質監査を追加してテンプレート資産化を強化するかが未決定。

### Virtual Debate (Round 1)
- Architecture Lead: 列一致だけでは品質劣化（空欄・重複・日付崩れ）を検知できず、運用事故の温床になる。
- Product/UX Lead: 利用者視点では「動くテンプレート」だけでなく「誤用しにくいテンプレート」が必要。監査メッセージが重要。
- QA/Delivery Lead: ベンチマーク4表のcontract testがないと、観測回帰を局所テストで見逃す。

### Synthesis & Decision
- 3ロール合意として、Phase 9次イテレーションは監査範囲拡張 + 4表観測テスト追加を優先する。
- 要件の根幹変更は不要のため、人間承認を待たずissue起票して実行可能と判断。
