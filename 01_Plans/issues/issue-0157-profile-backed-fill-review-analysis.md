# Issue: approved Format Profileからfill review analysisを実行する

## Meta
- Type: Feature / Runtime analysis boundary
- Status: Open
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

- [ ] approved Profileだけを入力とするlabel-free analysis APIを追加する。
- [ ] baseline snapshotをProfile側入力として要求しない。
- [ ] candidate Profileは拒否する。
- [ ] source profile / feature version不一致を拒否する。
- [ ] structure-only control prototypeはapproved Profile featuresからfill/border evidenceを除いて生成する。
- [ ] observation側も同じevidence filterでstructure-only比較する。
- [ ] issue-0156と同じtelemetry taxonomy / impact flagsを利用する。
- [ ] decision-impact / essential-unavailable / diagnostic-onlyを再現する。
- [ ] Profile canonical featuresや入力snapshotをmutateしない。
- [ ] matcher thresholdsを変更しない。
- [ ] production runtime / XLSX reader / provider / UIを変更しない。

## Validation plan

- snapshot-based 0156 analysisとProfile-based analysisのtelemetry一致を複数fixtureで確認。
- approved Profileからmatched / ambiguity / novel transitionを評価。
- fill-unavailable-for-discriminationをProfile featuresだけで再現。
- unapproved Profile拒否。
- Profile source profile改変拒否。
- 入力不変を確認。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
