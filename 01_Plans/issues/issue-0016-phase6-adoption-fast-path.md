# Issue: Phase 6 Adoption Fast Path（Overview/Tutorial価値最大化）

## Meta
- Type: Docs
- Status: Open
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
