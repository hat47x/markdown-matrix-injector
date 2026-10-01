# Issue: 取り込み済みの資産をプロジェクト単位で記録し、未取込の候補だけを示す

## Meta
- Type: Feature
- Status: Draft
- Priority: Medium
- Scope: src/core（台帳）、src/cli（`inspect --unimported`、`extract`）、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D8・D9、製品要求「重複回避」「provenance」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「重複回避」
- Dependency: issue-0193、issue-0194

## 背景

選択的な取り込みでは、同じ画像や表を何度も候補に出さないことが実務上重要である（ADR-0019 D8）。現行のSource Identity v1はファイル全体のダイジェストで、Candidate単位の同一性を表せない。

## Acceptance criteria
- [ ] 取り込んだCandidateごとに、source locator、fingerprint、種別、出力先、変換条件、確認状態を、可読なファイル（JSONまたはCSV）としてプロジェクトに記録する。MMIを外しても読める形式にする。
- [ ] `inspect`で「すべて」「未取込のみ」「完全一致の取込済みを除く」を選べる。
- [ ] 完全一致（同じfingerprint）と類似（研究層の類似判定）を別の証拠として示す。類似を取込済みとして自動で除外しない。
- [ ] 原本が更新されたとき、取り込み済みのCandidateのうち内容が変わったものを示す。

## Validation plan
issue-0194のテスト用ブックで、画像を1件取り込んだ後に`inspect --unimported`から外れること、ブック内の別シートにある同じ画像が「完全一致」と示されること、画像を差し替えると「変更あり」と示されることを確かめる。

## Remaining work
- 台帳の置き場所と名前。納品物一覧（delivery manifest）との統合の要否。
- 一括変換（ADR-0019 D9）の結果を台帳へ登録する方法は、変換器の評価後に決める。
