# Issue: 取り込み済みの資産をプロジェクト単位で記録し、未取込の候補だけを示す

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: src/core（台帳）、src/cli（`inspect --unimported`、`extract`）、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D8・D9、製品要求「重複回避」「provenance」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「重複回避」
- Dependency: issue-0193、issue-0194

## 背景

選択的な取り込みでは、同じ画像や表を何度も候補に出さないことが実務上重要である（ADR-0019 D8）。現行のSource Identity v1はファイル全体のダイジェストで、Candidate単位の同一性を表せない。

## Acceptance criteria
- [ ] 取り込んだCandidateごとに、source locator、fingerprint、種別、出力先、変換条件、確認状態を、可読なファイル（JSONまたはCSV）としてプロジェクトに記録する。MMIを外しても読める形式にする。
- [ ] `inspect`で「すべて」「未取込のみ」「完全一致の取込済みを除く」を選べる。
- [ ] 完全一致（同じfingerprint）と類似（研究層の類似判定）を別の証拠として示す。類似を取込済みとして自動で除外しない。
- [ ] 原本が更新されたとき、取り込み済みのCandidateのうち内容が変わったものを示す。

## Implementation checkpoint (2026-10-01)

最初の縦切りとして、`src/core/importLedger.ts` に可読JSON台帳を追加した。既定配置は `.mmi/import-ledger.json`、schema versionは1とする。entryは `locator / fingerprint / kind / output / conversion / confirmation / importedAt` を保持する。

同一性はCandidate fingerprintを正本とし、同じfingerprintが別シート・別座標に現れても `exact` とする。一方、同じ論理locator（source / sheet / range）でfingerprintだけが変わった場合は `changed` とし、単なる未取込と区別する。source全体のdigestは論理locator比較から意図的に除外する。

`mmi extract` の画像取り込み成功時には、出力画像を書いた後にこの台帳へ登録する。raw image bytesの抽出なので変換条件は `raw-image-bytes-v1` とformatを記録し、明示的なCLI選択による取り込みを `confirmed` とする。台帳自体はJSONなのでMMIを外しても読める。

残りは `inspect` 側の台帳照合・表示・`--unimported`、およびissue-0194 fixtureを使ったCLI integration testである。研究層の類似判定はexact/changedとは別証拠のままとし、この台帳だけで自動除外しない。

## Validation plan
issue-0194のテスト用ブックで、画像を1件取り込んだ後に`inspect --unimported`から外れること、ブック内の別シートにある同じ画像が「完全一致」と示されること、画像を差し替えると「変更あり」と示されることを確かめる。

## Remaining work
- `inspect`へ台帳照合結果と`--unimported`を接続する。
- issue-0194 fixtureでextract→inspectのintegration testを追加する。
- 一括変換（ADR-0019 D9）の結果を台帳へ登録する方法は、変換器の評価後に決める。
