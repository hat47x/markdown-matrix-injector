# Issue: 取り込み済みの資産をプロジェクト単位で記録し、未取込の候補だけを示す

## Meta
- Type: Feature
- Status: In Progress（台帳 v1 の契約を固定。実装待ち）
- Priority: Medium
- Scope: src/core（台帳）、src/cli（`inspect --unimported`、`extract`）、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D8・D9、製品要求「重複回避」「provenance」、[Import Ledger v1](../../02_Architecture/import-ledger-v1.md)
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「重複回避」
- Dependency: issue-0193、issue-0194

## 背景

選択的な取り込みでは、同じ画像や表を何度も候補に出さないことが実務上重要である（ADR-0019 D8）。現行のSource Identity v1はファイル全体のダイジェストで、Candidate単位の同一性を表せない。

## Acceptance criteria
- [ ] 取り込んだCandidateごとに、source locator、fingerprint、種別、出力先、変換条件、確認状態を、可読なJSONとしてプロジェクトに記録する。MMIを外しても読める形式にする。
- [ ] `inspect`で「すべて」「未取込のみ」「完全一致の取込済みを除く」を選べる。
- [ ] 完全一致（同じfingerprint）と類似（研究層の類似判定）を別の証拠として示す。類似を取込済みとして自動で除外しない。
- [ ] 原本が更新されたとき、取り込み済みのCandidateのうち内容が変わったものを示す。

## v1で固定した判断（2026-10-01）

- 既定台帳は `.mmi/import-ledger.json`。通常のJSONで、MMI固有DBにはしない。
- Candidate fingerprintを**内容同一性**、locatorを**位置**、sourceDigestを**原本版**として分離する。
- `exact`（同じ内容・同じ位置）、`moved`（同じ内容・別位置）、`changed`（同じ位置・内容変更）、`unimported`を決定論的に区別する。
- 同じ画像が別シートにある場合は `moved` と機械的に同型なので「完全一致（別位置）」として根拠locatorを示す。業務上同じ対象だとは断定しない。
- `inspect --unimported`は `exact` / `moved` を除き、`changed` / `unimported`を残す。
- 類似判定は完全一致とは別証拠のままにし、自動除外には使わない。
- `extract`成功時だけ台帳を更新し、出力欠落は別診断にする。
- delivery manifestとはv1では統合しない。台帳は「取り込んだ事実」、manifestは「納品物」という責務を保つ。

## Validation plan
issue-0194のテスト用ブックで、画像を1件取り込んだ後に`inspect --unimported`から外れること、ブック内の別シートにある同じ画像が「完全一致（別位置）」と示されること、画像を差し替えると「変更あり」と示されることを確かめる。

## Remaining work
- `src/core`に台帳の読み書き・検証・Candidate照合を実装する。
- `mmi extract`成功時の台帳更新を接続する。
- `mmi inspect --unimported`とJSONの照合結果を接続する。
- issue-0194の生成fixtureで統合テストを追加する。
- 一括変換（ADR-0019 D9）の結果を台帳へ登録する方法は、変換器の評価後（issue-0200）に決める。
