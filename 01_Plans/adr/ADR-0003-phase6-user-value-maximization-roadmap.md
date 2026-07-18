# ADR-0003: Phase 6 ユーザ価値最大化ロードマップ

- Status: Accepted
- Date: 2026-03-24
- Deciders: Project Maintainers
- Scope: `01_Plans/adr/`, `01_Plans/issues/`, `02_Architecture/`, `04_Documentation/`

## Context (背景と課題)
- Phase 6 の基盤（4層ドキュメント構造とfeedback loop）は `ADR-0002` で確定したが、次に何をどの順番で進めると採用価値が最大化されるかは実行計画まで落ちていない。
- 既存の公開文書は初版として成立している一方、導入判断者・PoC担当・運用担当の「意思決定に直結する証拠（時間短縮、リスク低減、導入可否判断材料）」を強化する余地がある。
- 文書化の改善は、単に説明を増やすのではなく「読者が最短で成果を再現できること」「つまずきを上流仕様へ還流すること」を軸に優先順位付けすべきである。

## Decision (決定事項)
### 1) 実行ストリームと優先順
Phase 6 の次イテレーションは、以下の4ストリームで実行する。
1. **Adoption Fast Path**: Overview/Tutorial で「30分以内の初回成功体験」と「誰に効くか」を明確化。
2. **Scenario ROI Proof**: SIer向けシナリオに、工数削減・レビュー容易性・納品適合性の観測ポイントを追加。
3. **Reference Trustworthiness**: 詳細仕様に制約・失敗時挙動・関連テスト/設計リンクを追記し、問い合わせ時の一次回答源として成立させる。
4. **Feedback Loop Operations**: docs audit を定期運用し、発見事項を requirements / architecture / tests / issues へトレース可能に戻す。

優先順位は **(1) Fast Path → (2) Scenario ROI → (3) Reference Trustworthiness → (4) Feedback Loop Ops** とする。
- 理由: 初回導入価値が不明な状態では、詳細仕様や運用ガバナンスを強化しても採用率向上に寄与しにくいため。

### 2) 成功指標（KPI）
各ストリームは以下の KPI を満たしたときに「ユーザ価値を増加させた」と判定する。
- **Time-to-First-Success (TFS):** Tutorial の手順で 30 分以内に初回成功できる（手順数・前提条件・成功判定が明示されている）。
- **Decision Readiness:** 導入判断者が「採用可否」を判断するための比較軸（利用前/利用後、制約、適用条件）を Scenario guide だけで確認できる。
- **Support Deflection Readiness:** Reference から失敗時挙動・制約・関連正本へ辿れるため、問い合わせ一次回答を文書で自己完結できる。
- **Feedback Closure:** docs audit で見つかった論点の 100% が requirements / architecture / test / issue のいずれかへ分類・還流済みである。

### 3) マイルストーン定義
- **M1 (Adoption Gate):** issue-0016 完了。Overview/Tutorial導線の最短化。
- **M2 (ROI Gate):** issue-0017 完了。業務比較観点の証拠化。
- **M3 (Trust Gate):** issue-0018 完了。Referenceの一次回答源化。
- **M4 (Ops Gate):** issue-0019 + issue-0020 完了。docs audit運用と計測テンプレート定着。

### 4) 運用ルール
- 各ストリームは独立issueとして起票し、**受入条件に KPI か観測可能な代替指標**を含める。
- docs更新で検出された仕様ギャップは、文書だけで抱え込まず上流（requirements / architecture / tests / issue）へ即時反映する。

## Consequences (結果と影響)
- **Good:** 文書更新が「量」ではなく「採用率・再現性・問い合わせ削減」に結びつく。
- **Good:** 各改善がIssue単位で検証され、どの知見を上流へ反映したか追跡しやすくなる。
- **Good:** 導入判断者向け資料と現場利用者向け手順のギャップを埋められる。
- **Bad:** docs audit とトレース運用の負荷が増える。
- **Bad:** シナリオ証拠（工数比較など）は定期的な更新が必要となる。

## Traceability (関連情報)
- Related ADRs: `01_Plans/adr/ADR-0001-documentation-governance.md`, `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`
- Related Issues: `01_Plans/issues/issue-0015-phase6-public-docs-foundation.md`, `01_Plans/issues/issue-0016-phase6-adoption-fast-path.md`, `01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md`, `01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`, `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`, `01_Plans/issues/issue-0020-phase6-value-kpi-and-audit-scorecard.md`

## 議事録 (AI読込不要)
### Issue Definition
- Phase 6 で「次にどの文書をどの順で磨くとユーザ価値が最大化されるか」が曖昧。
- 既存計画に KPI とマイルストーンがなく、完了判定が主観的になる懸念があった。

### Virtual Debate
- Architecture Lead: まず導線を最短化しないと、後続の詳細仕様改善が読まれない。Overview/Tutorialに集中すべき。
- Product/UX Lead: 導入判断者はROI根拠を求める。シナリオに比較観点（何がどれだけ楽になるか）を入れないと採用が進まない。
- QA/Delivery Lead: 詳細仕様に制約や失敗時挙動がないと問い合わせが増える。Referenceの信頼性向上を同時に進めるべき。
- QA/Delivery Lead: KPI未定義だとDone判定がぶれる。計測テンプレートを issue 化して運用固定すべき。

### Synthesis & Decision
- 優先順は「初回成功体験」→「業務価値証明」→「仕様信頼性」→「継続運用」。
- 4ストリーム + KPI計測ストリーム（issue-0020）を定義し、各ストリームで上流反映の完了条件を持たせる。
