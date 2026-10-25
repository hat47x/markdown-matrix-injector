# Issue: 取り込み済みの資産をプロジェクト単位で記録し、未取込の候補だけを示す

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: src/core（台帳）、src/cli（`inspect --unimported`、`extract`）、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D8・D9、ADR-0021 D1〜D4、製品要求「重複回避」「provenance」
- Related analysis: [製品価値と現行実装のギャップ](../../../02_Architecture/product-gap-analysis.md) §2「重複回避」
- Dependency: issue-0193、issue-0194

## 背景

選択的な取り込みでは、同じ画像や表を何度も候補に出さないことが実務上重要である（ADR-0019 D8）。現行のSource Identity v1はファイル全体のダイジェストで、Candidate単位の同一性を表せない。

## Acceptance criteria
- [x] 取り込んだCandidateごとに、occurrence identity（source locator）、content identity（fingerprint）、種別、出力先、変換条件、review state、review basisを、可読なファイル（JSONまたはCSV）としてプロジェクトに記録する。MMIを外しても読める形式にする。
- [x] `inspect`で「すべて」「未取込のみ」「完全一致の取込済みを除く」を選べる。
- [x] 完全一致（同じfingerprint）と類似（研究層の類似判定）を別の証拠として示す。類似を取込済みとして自動で除外しない。
- [x] 原本が更新されたとき、Candidate全体ではなく可能な範囲でClaim/evidence単位にfresh/staleを判定し、review basisが変わった判断を`stale`として示す。
- [x] 同じcontent fingerprintを持つ別occurrenceを別物として保持し、semantic roleやreview stateを自動継承しない。
- [x] source更新後のlineage reconciliationは、fingerprint一致だけでなくlocator・近傍・object id等の証拠を保持し、自動同一視できない場合は候補として提示する。

## Implementation checkpoint (2026-10-01)

`src/core/importLedger.ts`に可読JSON台帳`mmi.ledger/v1`を追加した。既定名は`mmi-ledger.json`。entryはsource / sheet / place（occurrence identity）、fingerprint（content identity）、kind、source digest、output、変換条件、review state、basis、reviewedAtを保持する。fingerprintはdigestだけでなくrepresentationも同一性に含める。`mmi schema ledger`で機械可読なJSON Schemaを取得でき、`readLedger()`はentry内部も検査して不正なreview state・digest・Claim basis等をfail-closedで拒否する。旧`confirmed`はlegacy v1読込互換だけで許可し、メモリ上では`accepted`へ正規化する。

ADR-0021に合わせ、occurrence identityとcontent identityは分離する。同じoccurrence・同じfingerprintは `imported`、同じoccurrenceで内容が変わったものは `changed`、別occurrenceの同じfingerprintは `duplicate`、該当なしは `unimported` とする。duplicateは証拠であり、そのoccurrenceへreview stateを継承しない。

CLIの `mmi extract` は既定で `<root>/mmi-ledger.json` へ成功した画像occurrenceを記録する。`mmi inspect` は台帳を照合し、全件・`--unimported`・`--exclude-imported`を選べる。`--unimported`はnever-imported occurrence（別occurrenceの同一content=`duplicate`を含む）に限定し、`--exclude-imported`はそれに`changed` / `stale`も加える。issue-0194のコード生成fixtureでextract→inspect→画像差し替えまでintegration testを追加した。

ADR-0021 D2/D4に合わせ、review時にはClaimごとのlocal evidence digestを保存する。whole-source digestはfreshness判定から外し、無関係なsheet変更で全Claimがstaleにならないようにする。一方、Claim値・evidence・method・algorithm/runtime identityが変わった場合は`staleClaims`として列挙する。content fingerprint自体が変わった`changed` occurrenceでも、どのClaim basisが変わったかを併記する。

lineage reconciliationは自動同一視を行わず、過去entryを候補として提示するだけにする。`same-content`に加え、同一sheet、object name、source-native media/object identity、nearby-tableをEvidenceとして保持し、候補ごとにreasonsを出す。review stateやsemantic roleはlineage候補から継承しない。

研究層のEvidenceは二層を明示する。Candidate自身に属する`provider / scale / value`付き`scores[]`は`researchScores`としてそのまま載せる。別occurrenceとのpairwise similarityは`mmi.candidate-similarity-evidence/v1` sidecarにcurrent occurrence、target occurrence、provider/version、metric namespace/name/semantics/value/rangeを保持し、`mmi inspect --similarity-evidence <file>`で同じinspect面へ表示する。provider間・scale/namespace間で平均や正規化をせず、ledger state判定とfilterは従来どおりoccurrence/content/Claim review basisだけで決める。高いcosine等も`imported`や`duplicate`の証明にはならず、`--unimported`から自動除外しない。

## Hardening checkpoint (2026-10-07)

人手レビュー済みCandidateの履歴は、source/content/Claim basisだけでなく**保存そのものもfail-safe**である必要がある。台帳更新は同一ディレクトリの一時ファイルへ完全なJSONを書き、`fsync`後にrenameで置換する。置換前に失敗した場合は既存`mmi-ledger.json`を維持し、一時ファイルを残さない。既存台帳を置換する場合はfile modeを引き継ぐ。

## Hardening checkpoint (2026-10-09)

atomic renameだけでは、複数のMMIプロセスが同じ台帳を同時にread→merge→writeした場合のlost updateを防げない。人手レビュー結果を黙って失うことは許容できないため、`recordEntries()`は台帳と同じディレクトリの排他lockを取得してから最新台帳を読み、mergeとatomic replaceを行う。

別writerがlockを保持している場合、後続writerは既存履歴を上書きせずfail-closedで終了する。lockは成功時・通常の書込失敗時に除去する。プロセス異常終了で残ったlockは、稼働中writerを誤って排除しないよう自動削除しない。利用者が他のMMI処理が動いていないことを確認したうえで扱う。

この境界はレビュー判断の自動マージではない。同じoccurrenceへの競合判断を勝手に解決せず、**履歴を失わないことを優先して再実行を要求する**。

## Validation plan
issue-0194のテスト用ブックで、画像を1件取り込んだ後に`inspect --unimported`から外れること、ブック内の別シートにある同じ画像が「完全一致」と示されること、画像を差し替えると「変更あり」と示されることを確かめる。

## Completion decision（2026-10-02）

issue-0195の受入条件はすべて完了した。

- **Delivery manifestとは保存形式を統合しない。** 現行のdelivery manifestはLinked文書でカード扱いになる別紙を納品時に列挙する一覧であり、import ledgerはExtracted Candidateのoccurrence/content/review/provenance履歴である。ライフサイクルと意味が異なるため、同じ台帳へ混在させない。将来、detachabilityや納品監査で横断表示が必要になった場合は、両方を入力にするread-only reportとして接続する。
- **一括変換の台帳登録はissue-0200へ委譲する。** issue-0200にはすでに「baseline conversion → Candidate reconciliation → Markdown/assets → import ledger」と、一括変換結果をissue-0195の台帳へ登録して後続の`inspect --unimported`と整合させる受入条件がある。Converter評価前に0195側へ固有処理を追加しない。
- CandidateレビューUIはissue-0202が本台帳のstate/filterを利用する。0195側にUI責務を持ち込まない。
