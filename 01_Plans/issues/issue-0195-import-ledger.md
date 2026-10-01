# Issue: 取り込み済みの資産をプロジェクト単位で記録し、未取込の候補だけを示す

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: src/core（台帳）、src/cli（`inspect --unimported`、`extract`）、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D8・D9、ADR-0021 D1〜D4、製品要求「重複回避」「provenance」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「重複回避」
- Dependency: issue-0193、issue-0194

## 背景

選択的な取り込みでは、同じ画像や表を何度も候補に出さないことが実務上重要である（ADR-0019 D8）。現行のSource Identity v1はファイル全体のダイジェストで、Candidate単位の同一性を表せない。

## Acceptance criteria
- [x] 取り込んだCandidateごとに、occurrence identity（source locator）、content identity（fingerprint）、種別、出力先、変換条件、review state、review basisを、可読なファイル（JSONまたはCSV）としてプロジェクトに記録する。MMIを外しても読める形式にする。
- [x] `inspect`で「すべて」「未取込のみ」「完全一致の取込済みを除く」を選べる。
- [ ] 完全一致（同じfingerprint）と類似（研究層の類似判定）を別の証拠として示す。類似を取込済みとして自動で除外しない。
- [x] 原本が更新されたとき、Candidate全体ではなく可能な範囲でClaim/evidence単位にfresh/staleを判定し、review basisが変わった判断を`stale`として示す。
- [x] 同じcontent fingerprintを持つ別occurrenceを別物として保持し、semantic roleやreview stateを自動継承しない。
- [x] source更新後のlineage reconciliationは、fingerprint一致だけでなくlocator・近傍・object id等の証拠を保持し、自動同一視できない場合は候補として提示する。

## Implementation checkpoint (2026-10-01)

`src/core/importLedger.ts` に可読JSON台帳 `mmi.ledger/v1` を追加した。既定名は `mmi-ledger.json`。entryはsource / sheet / place（occurrence identity）、fingerprint（content identity）、kind、source digest、output、変換条件、review state、basis、reviewedAtを保持する。fingerprintはdigestだけでなくrepresentationも同一性に含める。

ADR-0021に合わせ、occurrence identityとcontent identityは分離する。同じoccurrence・同じfingerprintは `imported`、同じoccurrenceで内容が変わったものは `changed`、別occurrenceの同じfingerprintは `duplicate`、該当なしは `unimported` とする。duplicateは証拠であり、そのoccurrenceへreview stateを継承しない。

CLIの `mmi extract` は既定で `<root>/mmi-ledger.json` へ成功した画像occurrenceを記録する。`mmi inspect` は台帳を照合し、全件・`--unimported`・`--exclude-imported`を選べる。`--unimported`はnever-imported occurrence（別occurrenceの同一content=`duplicate`を含む）に限定し、`--exclude-imported`はそれに`changed` / `stale`も加える。issue-0194のコード生成fixtureでextract→inspect→画像差し替えまでintegration testを追加した。

ADR-0021 D2/D4に合わせ、review時にはClaimごとのlocal evidence digestを保存する。whole-source digestはfreshness判定から外し、無関係なsheet変更で全Claimがstaleにならないようにする。一方、Claim値・evidence・method・algorithm/runtime identityが変わった場合は`staleClaims`として列挙する。content fingerprint自体が変わった`changed` occurrenceでも、どのClaim basisが変わったかを併記する。

lineage reconciliationは自動同一視を行わず、過去entryを候補として提示するだけにする。`same-content`に加え、同一sheet、object name、source-native media/object identity、nearby-tableをEvidenceとして保持し、候補ごとにreasonsを出す。review stateやsemantic roleはlineage候補から継承しない。

## Validation plan
issue-0194のテスト用ブックで、画像を1件取り込んだ後に`inspect --unimported`から外れること、ブック内の別シートにある同じ画像が「完全一致」と示されること、画像を差し替えると「変更あり」と示されることを確かめる。

## Remaining work
- 完全一致と研究層similarity evidenceを同じinspect面で並べるが、自動除外へ使わないことを固定する。
- 納品物一覧（delivery manifest）との統合の要否。
- 一括変換（ADR-0019 D9）の結果を台帳へ登録する方法は、変換器の評価後に決める。
