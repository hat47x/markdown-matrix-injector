# Issue: Format Profileをversioned design assetとして定義する

## Meta
- Type: Architecture / Feature design
- Status: Done
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
- [x] hidden online learningを禁止し、Profile更新を明示commitとして扱う。
- [x] 新規/更新は候補生成 -> 差分表示 -> human approval -> version controlの順とする。
- [x] feature version / source profile不一致をfail-closedにする。
- [x] current worksheet-format-v6 prototypeとの変換可能性を定義する。
- [x] 保存場所・schema決定前にMMI Notation v1の正本と混同しない責務境界を文書化する。
- [x] profileが無くても既存MMI機能は成立する。
- [x] 認知providerが自動更新・自動承認できないことをschema validation等で固定する。

### Validation plan

schema fixtureでvalid profile、version mismatch、source-profile mismatch、未承認candidateを検証し、既存prototype生成規則との整合をfocused testで確認する。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で成功。
- focused unit/integration test: **7 tests / 7 pass / 0 fail**。
- JSON SchemaはGitHub上の実ファイルをJSON parseし、以下を確認:
  - `schemaVersion = mmi-format-profile-v1`
  - lifecycleは `candidate / approved`
  - approval `kind = human`
  - candidateでapproval禁止、approvedでapproval必須の条件を保持。
- 検証内容:
  - existing `WorksheetFormatPrototype`からcanonical candidateを生成。
  - candidateはapproval metadataを持てず、matcher prototypeへ復元不可。
  - explicit human approval metadataを付与したcopyだけapprovedへ遷移。
  - feature version不一致をfail-closed。
  - source profile / evidence contract不一致をfail-closed。
  - feature列が非canonical（順序・重複等）のprofileを拒否。
  - stable ASCII id境界を固定。
  - approvalはcandidateをmutateせず新しいassetを返す。
- `WorksheetFormatPrototype`生成規則、worksheet-format-v6、matcher score、fill telemetryは変更していない。
- 永続I/O、自動commit、production runtime接続、認知providerによるapprovalは追加していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
