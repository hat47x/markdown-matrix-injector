# Issue: approved Format Profileからfill review analysisを実行する

## Meta
- Type: Feature / Runtime analysis boundary
- Status: Done
- Priority: High
- Scope: approved Format Profile -> fill-aware/control matcher comparison -> label-free review analysis
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Depends on: issue-0137 Done, issue-0156 Done
- Parallel exclusion: production runtime / XLSX reader / matcher thresholds / telemetry evaluation fixturesは変更しない

## Problem

issue-0156でdeterministic review reasonはevaluation labelから分離された。
ただし既存analysis APIはprototype baselineのWorksheet snapshotを要求する。

運用資産であるapproved Format Profileはcanonical featuresを保持しているため、
runtime reviewのために元baseline snapshotを別途保持・再読込する必要はない形が望ましい。

## Execution Plan

- worksheet format featureのevidence filtering primitiveを共有化する。
- structure-only source profileを共通contractとして定義する。
- approved Format Profileからfill-aware prototypeとstructure-only control prototypeを決定論的に構成する。
- observation snapshotを両profileでmatchし、issue-0156の共通classification helperへ渡す。
- Profileのfill factsはcanonical featuresから取得する。
- candidate/Profile provenance、approval、feature/source profile不整合は既存Format Profile contractでfail-closedする。

## Acceptance criteria

- [x] approved Profileだけを入力とするlabel-free analysis APIを追加する。
- [x] baseline snapshotをProfile側入力として要求しない。
- [x] candidate Profileは拒否する。
- [x] source profile / feature version不一致を拒否する。
- [x] structure-only control prototypeはapproved Profile featuresからfill/border evidenceを除いて生成する。
- [x] observation側も同じevidence filterでstructure-only比較する。
- [x] issue-0156と同じtelemetry taxonomy / impact flagsを利用する。
- [x] decision-impact / essential-unavailable / diagnostic-onlyを再現する。
- [x] Profile canonical featuresや入力snapshotをmutateしない。
- [x] matcher thresholdsを変更しない。
- [x] production runtime / XLSX reader / provider / UIを変更しない。

## Validation plan

- snapshot-based 0156 analysisとProfile-based analysisのtelemetry一致を複数fixtureで確認。
- approved Profileからmatched / ambiguity / novel transitionを評価。
- fill-unavailable-for-discriminationをProfile featuresだけで再現。
- unapproved Profile拒否。
- Profile source profile改変拒否。
- 入力不変を確認。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- Profile-backed moduleと共有classifier/filter境界を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **6 tests / 6 pass / 0 fail**。
- 確認内容は次のとおりです。
  - approved Profileのcanonical featuresだけからstructure-only control prototypeを導出。
  - decision-impact transitionを再現。
  - fill-unavailable + fill-unavailable-for-discriminationをProfile fill factsだけで再現。
  - fill-tone-disagreementをdiagnostic扱いのまま再現。
  - candidate状態のProfileを既存 `formatProfileToWorksheetPrototype` 境界で拒否。
  - source profile改変を既存Format Profile compatibility境界で拒否。
  - approved Profile / observation snapshotをmutateしない。
- repository test sourceでは同一fixtureをsnapshot-based 0156 analysisとProfile-backed analysisへ通し、telemetry / impact flags一致を比較する。
- worksheet feature evidence filterを `filterWorksheetFormatFeaturesByEvidence` として共有化し、既存Prototype生成/matchも同じ関数を利用。
- structure-only source profileをWorksheetFormatPrototype moduleへ共有化し、既存evaluation aliasのID/意味を維持。
- issue-0156のreason classifier / impact projectionを共有し、Profile-backed専用taxonomyは作っていない。
- matcher thresholds / feature extraction / external-XLSX reader / production runtime / provider / UIは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。0157固有のstrict API整合とruntime orchestration境界をfocusedに検証。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
