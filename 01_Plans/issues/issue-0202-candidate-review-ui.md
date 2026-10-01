# Issue: 人の作業を止めないCandidateレビューUIを設計・実装する

## Meta
- Type: Feature
- Status: Draft
- Priority: Medium
- Scope: VS Code extension（Candidate一覧、採否、フィルタ、診断表示）、利用者観測
- Expected verification level: manual-e2e

## Traceability
- Related ADR/Spec: ADR-0019 D8・D13、ADR-0018、製品要求「候補抽出」「個別取り込み」「執筆支援」
- Dependency: issue-0193（Candidate契約）、issue-0194（最初の非表Candidate）、issue-0195（取込済み状態）

## 背景

Candidateを製品価値へつなぐには、検出精度だけでなく、人が執筆を止めずに候補を確認できる経路が必要である。候補採否を入力中に強制すると、MMIがモダナイズを支援するどころか既存の作業速度を落とす。

レビューUIは、Authorityの事実、認知による推定、取込済み状態を同じ一覧で見せつつ、確度を混同させない。通常の執筆中は控えめにし、レビュー操作を開いたときに詳細を示す。

## Acceptance criteria

- [ ] Candidateをsource / type / state（observed・inferred・confirmed・abstained）/ import stateで絞り込める。
- [ ] 「すべて」「未取込のみ」「完全一致の取込済みを除外」をUIから選べる。
- [ ] Authority由来の事実とCognitive Assistance由来の候補を表示上区別する。provider間confidenceを1本の総合スコアへ合成しない。
- [ ] Candidateを採用、修正して採用、却下、保留できる。未確認候補が存在しても通常の編集を妨げない。
- [ ] 採用時はissue-0194等のextract経路を呼び、同じ処理をUI内に二重実装しない。
- [ ] 取り込み済みのsourceが変わった場合は「変更あり」と示すが、本文を自動で書き換えない。
- [ ] 診断の表示強度を執筆中とレビュー/CIで分ける設計を含める。
- [ ] 利用者観測で、候補確認のために執筆を中断した回数と、採用・修正・却下率を記録する。

## Validation plan

画像Candidateを含む架空の設計書を使い、通常執筆 → 後から候補レビュー → 画像取り込み → 原本画像差し替え → 変更確認までをWindows実機で観測する。issue-0111の利用者観測と可能な範囲で共通化する。

## Remaining work

- Tree / Shape等は各Source Adapterの実装後に同じUIへ追加する。
- Candidate数が多い場合のページング・検索は実測後に決める。
