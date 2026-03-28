# Issue: Phase 6 Adoption Fast Path（Overview/Tutorial価値最大化）

## Meta
- Type: Docs
- Status: In Progress
- Priority: High
- Scope: `04_Documentation/overview.md`, `04_Documentation/tutorial.md`, `04_Documentation/README.md`
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`, `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 初見ユーザーが 30 分以内に「埋め込み成功」を再現できる最短導線を明文化し、Overview から Tutorial への遷移で迷わない構成に再設計する。

### Success metric (価値指標)
- Time-to-First-Success (TFS) が 30 分以内で再現可能な情報密度であること。
- 導入判断者/PoC担当/運用担当の3ペルソナが、それぞれ「次に読む文書」を1クリックで辿れること。

### Acceptance criteria (受入条件)
- [ ] `overview.md` に対象ユーザー別の価値（導入判断者/PoC担当/運用担当）が明記されること。
- [ ] `tutorial.md` に「開始条件」「所要時間目安」「成功判定」「失敗時の最初の確認ポイント」が追加されること。
- [ ] `README.md` の導線が `Overview -> Tutorial -> Scenario -> Reference` の順で一貫すること。
- [ ] docs audit で、必須セクション（Target reader / Prerequisites / Expected result / Related docs / Known limitations）が維持されること。

### Task breakdown (作業分解)
- [ ] Overview の価値訴求を読者別に再構成する。
- [ ] Tutorial に time-boxed handrail（30分成功導線）を追加する。
- [ ] Documentation README の導線を見直し、読む順序を固定する。
- [ ] docs audit 実行結果を issue に記録する。

### Validation plan (検証計画)
- `rg -n "Overview|Tutorial|Scenario|Reference" 04_Documentation/README.md` で導線順を確認する。
- `rg -n "30 分|30分|所要時間|成功判定|失敗時" 04_Documentation/tutorial.md 04_Documentation/overview.md` で成功導線と初動トラブルシュートを確認する。
- `rg -n "^## Target reader|^## Prerequisites|^## Expected result|^## Related docs|^## Known limitations" 04_Documentation/overview.md 04_Documentation/tutorial.md` で必須セクションを確認する。
- `python3 01_Plans/tools/planning_queue.py` で planning_queue 上の `issue_pending` / `issue_orphan` を確認する。

## Validation evidence (実行証跡)
### Evidence log template
- Run date (UTC): `YYYY-MM-DD`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/planning_queue.py`
  - `rg -n "Validation plan|Status|Done|In Progress|Open" 01_Plans/issues/issue-0016-phase6-adoption-fast-path.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
- Expected:
  - `issue_pending`: `>= 0` (進捗に応じた件数)
  - `issue_orphan`: `0`
  - 対象3Issueの `Validation plan` / `Status` が追跡可能

### 2026-03-26 (UTC) planning_queue observation
- Command: `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `issue_pending: 5`
  - `issue_orphan: 0`
- Interpretation:
  - 本Issueは未完了タスクが残るため `In Progress` が妥当。
  - orphan 未発生のため、関連 ADR 参照整合は維持。

### 2026-03-28 (UTC) Stream A overview validation
- Scope note:
  - Stream A は `overview.md` 担当範囲の受入条件（読者別価値明記 + 必須セクション維持）に限定して検証。
- Commands:
  - `rg -n "^## Target reader|^## Prerequisites|^## Expected result|^## Related docs|^## Known limitations" 04_Documentation/overview.md`
  - `rg -n "導入判断者|PoC|運用" 04_Documentation/overview.md`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - 必須セクション 5 件（Target reader / Prerequisites / Expected result / Related docs / Known limitations）を確認。
  - `overview.md` 内で「導入判断者 / PoC / 運用」に関する価値記述を確認。
  - planning queue は `issue_pending: 5`, `issue_orphan: 0` を確認。
- Interpretation:
  - Overview 単体の受入条件（対象ユーザー別価値 + quality gate 必須セクション維持）は充足。
  - Tutorial / README 側の受入条件は別ストリームで継続。
