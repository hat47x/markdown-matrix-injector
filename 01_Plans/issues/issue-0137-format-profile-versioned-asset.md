# Issue: Format Profileをversioned design assetとして定義する

## Meta
- Type: Architecture / Feature design
- Status: Draft
- Priority: High
- Scope: Format Profile schema, lifecycle, compatibility rules, fixture/prototype generation boundary
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, ADR-0017-fly-inspired-format-deviation-assistance.md
- Depends on: issue-0135 Done

## Execution Plan
### Proposed solution

worksheet-format prototypeを隠れた学習状態ではなく、明示的にversion controlできるFormat Profileへ昇格するための最小schemaとlifecycleを定義する。

候補属性はstable profile id、schema version、human-readable label / purpose、feature contract version、source profile / evidence contract、baseline由来の再生成情報またはcanonical feature representation、provenance、created / approved metadata、compatibility boundaryとする。

prototypeは引き続き観測と同じadapterから生成し、手書きfeature抜粋を正本にしない。

### Acceptance criteria
- [ ] hidden online learningを禁止し、Profile更新を明示commitとして扱う。
- [ ] 新規/更新は候補生成 -> 差分表示 -> human approval -> version controlの順とする。
- [ ] feature version / source profile不一致をfail-closedにする。
- [ ] current worksheet-format-v6 prototypeとの変換可能性を定義する。
- [ ] 保存場所・schema決定前にMMI Notation v1の正本と混同しない責務境界を文書化する。
- [ ] profileが無くても既存MMI機能は成立する。
- [ ] 認知providerが自動更新・自動承認できないことをschema validation等で固定する。

### Validation plan

schema fixtureでvalid profile、version mismatch、source-profile mismatch、未承認candidateを検証し、既存prototype生成規則との整合をfocused testで確認する。
