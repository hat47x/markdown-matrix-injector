# Issue: 人の作業を止めないCandidateレビューUIを設計・実装する

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: VS Code extension（Candidate一覧、採否、フィルタ、診断表示）、利用者観測
- Expected verification level: manual-e2e

## Traceability
- Related ADR/Spec: ADR-0019 D8・D13、ADR-0018、ADR-0020、製品要求「候補抽出」「個別取り込み」「執筆支援」
- Dependency: issue-0193（Candidate契約）、issue-0194（最初の非表Candidate）、issue-0195（取込済み状態）

## 背景

Candidateを製品価値へつなぐには、検出精度だけでなく、人が執筆を止めずに候補を確認できる経路が必要である。候補採否を入力中に強制すると、MMIがモダナイズを支援するどころか既存の作業速度を落とす。

レビューUIは、Authorityの事実、認知による推定、取込済み状態を同じ一覧で見せつつ、確度を混同させない。通常の執筆中は控えめにし、レビュー操作を開いたときに詳細を示す。

## Acceptance criteria

- [x] Candidateをsource / type / epistemic state（observed・inferred・abstained）/ execution characteristic（deterministic・provider-dependent）/ import stateで絞り込める。sourceはレビュー開始時のsource picker、import stateは既存の3状態filter、type / epistemic / executionは複数選択facet（同一軸OR・軸間AND・未選択軸=全件）で実装。採用・却下は別のreview stateとして扱い、`inferred + accepted`を表現できる。
- [x] 「すべて」「未取込のみ」「完全一致の取込済みを除外」をUIから選べる。
- [x] Authority由来の事実とCognitive Assistance由来の候補を表示上区別する。さらに`inferred + deterministic`と`inferred + provider-dependent`を区別し、決定論的推定をobservedとして見せない。provider間confidenceを1本の総合スコアへ合成しない。
- [x] Candidateを採用、修正して採用、却下、保留できる。採用・修正採用・却下・却下解除・永続保留・保留解除を実装済み。表はMarkdown表、画像はalt textを人手修正でき、いずれもCandidateの由来を変更しない。未確認候補が存在しても通常の編集を妨げない。
- [x] 採用時はissue-0194等のextract経路を呼び、同じ処理をUI内に二重実装しない。表も画像も既存の`extract`経路を利用する。
- [x] 取り込み済みのsourceが変わった場合は「変更あり」と示すが、本文を自動で書き換えない。
- [ ] deterministic pathは必要なlatency内なら通常表示に利用できる一方、provider-dependent pathは非同期で編集を止めない。診断の表示強度を執筆中とレビュー/CIで分ける設計を含める。
- [ ] 利用者観測で、候補確認のために執筆を中断した回数と、採用・修正・却下率を記録する。

## Validation plan

表・画像Candidateを含む架空の設計書を使い、通常執筆 → 後から候補レビュー → 選択的取り込み → 原本差し替え → 変更確認までをWindows実機で観測する。issue-0111の利用者観測と可能な範囲で共通化する。

## Current slice

- 表・画像・JSON Tree Candidateを同じレビュー画面へ出し、`all / unimported / exclude-imported`を既存ledgerで切り替える。却下済みCandidateは通常キューから除外し、`all`では復元可能な状態で表示する。JSON TreeはRFC 6901 JSON Pointerをoccurrenceとして使い、採用時に表示時fingerprintを再照合する。
- 採用時は表なら`extractTable`、画像なら`extractImages`を呼び、原本を変更せず標準資産とledgerへ記録する。表の「修正して取り込む」は抽出結果だけを編集し、現在sourceのCandidateを再照合してからcontent-addressedなMarkdownへ確定する。画像の「説明を修正して取り込む」は画像bytesを変えずalt textだけを編集する。どちらも再照合後に、人手差分がある場合だけ`reviewState: modified`として最終output digestとreview metadataを台帳へ固定する。
- `observed / inferred`、`deterministic / provider-dependent`、provider別Evidenceを合成せず表示する。
- レビューを閉じる操作は通常編集へ影響しない。保留は`mmi.review-decisions/v1`へ永続化し、通常レビューキューから外すが、`すべて`表示では解除できる。
- 却下・保留はimport ledgerと混ぜず、occurrence・content fingerprint・Claim basisへ結び付ける。内容または判断根拠が変われば決定は自動失効し、Candidateが再びレビューへ現れる。

## Remaining work

- ~~source / Candidate type / epistemic state / execution characteristicの明示フィルタを追加する。~~ → 実装済み。source picker＋import-state filter＋type/status/execution facetを分離し、Candidate契約上の軸を混同しない。
- Windows実機で表・画像を含むreview → extract → changed/stale表示をE2E確認する。
- JSON Treeはissue-0199の明示構造Adapterから同じUIへ接続済み。Shape等は各Source Adapterの実装後に追加する。
- Candidate数が多い場合のページング・検索は実測後に決める。
