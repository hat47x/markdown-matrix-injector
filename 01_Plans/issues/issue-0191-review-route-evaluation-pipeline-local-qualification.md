# Issue: Review-route evaluation pipeline local qualification command

## Meta
- Type: Developer verification / local qualification
- Status: Done
- Priority: High
- Scope: issue-0190 strict build + focused cross-layer regression command
- Production runtime: no changes

## Traceability
- Depends on: issue-0190 Implementation complete; local execution pending
- Related: issue-0171 / 0172 / 0174 / 0176 / 0177 / 0179 / 0183 / 0186 / 0187 / 0188 / 0189
- Related: skills/ponytail/SKILL.md

## Problem

issue-0190の残条件はactual repository checkout上でのstrict buildとcross-layer regression実行だが、実行者が毎回コマンドを組み立てる必要がある。

GitHub Actionsは月間利用量上限のため停止中であり、ここで新しいCI runnerや専用shell wrapperを増やす必要はない。

## Decision

既存のnpm/tsx経路だけを再利用し、package scriptsを2本追加する。

```text
npm run test:review-route-evaluation-pipeline
npm run qualify:review-route-evaluation-pipeline
```

意味:

- `test:review-route-evaluation-pipeline`
  - issue-0190のcross-layer testだけを実行する。
- `qualify:review-route-evaluation-pipeline`
  - `npm run build`
  - focused cross-layer test
  の順で実行する。

新規dependency、shell wrapper、artifact schema、CI workflowは追加しない。

## Acceptance criteria

- [x] focused test scriptがissue-0190 test fileを直接実行する。
- [x] qualification scriptがstrict buildを先に実行する。
- [x] build成功後だけfocused testへ進む。
- [x] existing `tsx` devDependencyを再利用する。
- [x] new dependencyを追加しない。
- [x] GitHub Actions workflowを追加・dispatchしない。
- [x] package.jsonがvalid JSON。
- [x] issue-0190へcanonical local commandを記録する。

## Validation evidence

### 2026-09-23 source validation

- `03_Implement/package.json` をJSON parse成功。
- `test:review-route-evaluation-pipeline`:
  `node --import tsx --test ./test/worksheetReviewRouteEvaluationPipeline.test.ts`
- `qualify:review-route-evaluation-pipeline`:
  `npm run build && npm run test:review-route-evaluation-pipeline`
- build/testの既存toolchainのみ使用。
- dependency / lockfile / GitHub Actions変更なし。
- current execution environmentにはprivate repository checkout/dependency treeがないため、このIssueではactual command成功は主張しない。
- issue-0190のruntime verification pending状態は維持する。
