# Issue: Establish Phase 6 public documentation foundation and feedback loop

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `00_Prompt/requirements.md`, `01_Plans/adr`, `01_Plans/issues`, `02_Architecture`, `04_Documentation`
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `00_Prompt/requirements.md`, `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 一般向け公開文書の情報アーキテクチャを定義し、概要・チュートリアル・活用シナリオ・詳細仕様の最初の正本を作成する。あわせて、文書化で見つかった学びを要件・設計・テストへ戻す feedback loop を計画文書として固定する。

### Acceptance criteria (受入条件)
- [x] `04_Documentation/README.md` から、一般向け文書の入口と文書間の読む順がわかること。
- [x] 少なくとも `overview`, `tutorial`, `scenario guide`, `reference` に相当する公開文書が 1 つ以上ずつ存在すること。
- [x] 文書化知見を requirements / architecture / test へ戻すルールが `02_Architecture` または `01_Plans` に明文化されていること。
- [x] docs audit で、各公開文書に対象読者・前提条件・期待結果・正本リンク・既知の制約が含まれていることを確認できること。

### Task breakdown (作業分解)
- [x] Phase 6 の要求水準と ADR を追加し、文書体系の方針を固定する。
- [x] 公開文書の情報アーキテクチャを `02_Architecture` に記述する。
- [x] `04_Documentation` に Phase 6 向けの公開文書群を追加する。
- [x] docs audit 観点を整理し、文書から見えたギャップを次の issue 候補へ落とし込む。

### Validation plan (検証計画)
- `python3 01_Plans/tools/planning_queue.py` で pending issue / orphan が期待どおりに見えることを確認する。
- `rg -n "^## Target reader|^## Prerequisites|^## Expected result|^## Related docs|^## Known limitations" 04_Documentation/*.md` で公開文書の必須セクションを確認する。
- `rg -n "Phase 6|feedback loop|docs audit" 00_Prompt/requirements.md 01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md 02_Architecture/phase6-public-documentation-architecture.md 04_Documentation/*.md` でトレーサビリティを確認する。


## Follow-up planning (Phase 6 concretization)
- 次の実行計画は `ADR-0003` と issue-0016〜0019 に分割し、ユーザ価値最大化の観点で段階実行する。
