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
- [ ] 取り込んだCandidateごとに、occurrence identity（source locator）、content identity（fingerprint）、種別、出力先、変換条件、review state、review basisを、可読なファイル（JSONまたはCSV）としてプロジェクトに記録する。MMIを外しても読める形式にする。
- [ ] `inspect`で「すべて」「未取込のみ」「完全一致の取込済みを除く」を選べる。
- [ ] 完全一致（同じfingerprint）と類似（研究層の類似判定）を別の証拠として示す。類似を取込済みとして自動で除外しない。
- [ ] 原本が更新されたとき、Candidate全体ではなく可能な範囲でClaim/evidence単位にfresh/staleを判定し、review basisが変わった判断を`stale`として示す。
- [ ] 同じcontent fingerprintを持つ別occurrenceを別物として保持し、semantic roleやreview stateを自動継承しない。
- [ ] source更新後のlineage reconciliationは、fingerprint一致だけでなくlocator・近傍・object id等の証拠を保持し、自動同一視できない場合は候補として提示する。

## Implementation checkpoint (2026-10-01)

`src/core/importLedger.ts` にschema version 1の可読JSON台帳を追加した。既定名は `.mmi/import-ledger.json`。entryは `locator / fingerprint / kind / output / conversion / reviewState / reviewBasis / importedAt` を保持する。

ADR-0021に合わせ、occurrence identityとcontent identityは分離する。同じlocator・同じfingerprintだけを `exact-occurrence`、同じlocatorで内容が変わったものを `changed-occurrence`、別locatorの同じfingerprintは `same-content` とする。`same-content` は証拠として示すだけで、review stateを継承せず未取込occurrenceとして保持できる。`recordImport` も同じoccurrenceだけを置換し、同一contentの別occurrenceを消さない。

画像の `mmi extract` 成功時は、raw image bytesを書いた後に台帳へ登録する。変換条件は `raw-image-bytes-v1` とformat、review stateは `confirmed`、review basisは `explicit-cli-extract` とする。

残りは `inspect` の照合・フィルタ、Claim/evidence freshness、lineage reconciliation、およびissue-0194 fixtureを使うintegration testである。

## Validation plan
issue-0194のテスト用ブックで、画像を1件取り込んだ後に`inspect --unimported`から外れること、ブック内の別シートにある同じ画像が「完全一致」と示されること、画像を差し替えると「変更あり」と示されることを確かめる。

## Remaining work
- `inspect`へ台帳照合結果と`--unimported`を接続する。
- Claim/evidence単位のfresh/staleとlineage候補の表現を追加する。
- issue-0194 fixtureでextract→inspectのintegration testを追加する。
- 納品物一覧（delivery manifest）との統合の要否。
- 一括変換（ADR-0019 D9）の結果を台帳へ登録する方法は、変換器の評価後に決める。
