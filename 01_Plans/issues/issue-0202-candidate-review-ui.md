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
- [x] Candidateを採用、修正して採用、却下、保留できる。採用・修正採用・却下・却下解除・永続保留・保留解除を実装済み。表はMarkdown表、画像はalt textを人手修正でき、JSON / YAML / XML / フラットテキスト / 表形式階層のTreeはnested Markdownとして採用できる。Choice listとShapeは確認・却下・保留を扱う。two-cell anchorのShapeは同じ画面から範囲を`region-snapshot`として画像化できるが、Shape自体のreview stateは変更しない。いずれもCandidateの由来を変更しない。未確認候補が存在しても通常の編集を妨げない。
- [x] 採用時は既存extract経路を呼び、同じ処理をUI内に二重実装しない。表は`extractTable`、画像は`extractImages`、各Treeは対応する既存extract経路を利用する。Treeはレビュー時fingerprintを現在sourceと再照合し、同じ構造位置でも内容または構造が変わっていれば採用しない。
- [x] 取り込み済みのsourceが変わった場合は「変更あり」と示すが、本文を自動で書き換えない。
- [x] deterministic pathは同期レビューで通常表示に利用し、診断の表示強度を執筆中とレビュー/CIで分ける。既存の`diagnosticPolicy.ts`で、執筆中のquietモードは編集中の行を一時抑制し、reviewでは全件、CLI/CIではこの抑制を使わない。
- [ ] provider-dependent Candidateは編集を止めない非同期経路からレビューへ合流させる。host側のbackground lane・source snapshot cache・fail-closed検証は実装済み。実際のM2/M3 Candidate producerを1つ接続し、provider待ちなしでレビュー開始→次回レビューでcache反映までを実機確認して完了とする。
- [ ] 利用者観測で、候補確認のために執筆を中断した回数、採用・修正・却下率、修正採用時の人手修正量を記録する。修正量は内容を保存せず、表本文と画像alt textを分けて文字数と変更区間文字数だけを集計する。

## Provider-dependent非同期境界 checkpoint（2026-10-08）

`application/candidateReviewProviderRefresh.ts` に、provider-dependent Candidateを同期レビューから分離するhost契約を追加した。provider laneはPromiseで実行するが、レビュー側はそのPromiseを待たず、同一source snapshotで既にcache済みの結果だけをdeterministic Candidateと合わせて現在セッションへ入れる。

現在セッションのCandidate集合は開始時に固定する。providerが途中で完了しても開いているQuickPickへ追加せず、memory cacheを更新して次回レビューで反映する。cache keyにはsource path・source label・source digestを含め、source bytesやworkspaceが変わった結果を再利用しない。provider出力は共通Candidate invariant、`provider-dependent` execution、laneとprovenanceのprovider一致、source label/digest一致を再検証し、不正な結果はcacheを置き換えない。異なるproviderが同じlocator/fingerprintを返してもprovider/model/artifact identityをreview session keyへ含め、別Candidateとして確認できる。

provider failureはmodal errorとして編集を中断せず、status barへ結果だけを示す。診断の執筆中/review/CIの強度差は既存`diagnosticPolicy.ts`とその単体テストで既に成立している。

このcheckpointは**実provider-dependent Candidate producerを製品へ登録したことを意味しない**。現時点の製品Candidate inventoryはdeterministic経路が中心であり、次段は意味契約が定まったM2/M3 producerを1つ接続して実機E2Eを行う。

## Validation plan

表・画像Candidateを含む架空の設計書とJSON Tree sourceを使い、通常執筆 → 後から候補レビュー → 連続レビュー → 選択的取り込み → 原本差し替え → 変更確認までをWindows実機で観測する。issue-0111の利用者観測と可能な範囲で共通化する。

観測機能自体は `test/candidateReviewObservation.test.ts` で、facet適用、実際のレビュー対象を母集団とした状態遷移、取込件数、修正量の集計、JSONL追記を確認する。修正量は表本文と画像alt textを分け、元と修正後の文字数、共通する先頭・末尾を除いた変更区間文字数だけを保存する。Candidate本文、修正文、絶対パスは観測記録へ保存しない。実際の中断回数や利用者の負担は人の操作を伴うため、自動テストの値だけから判断しない。

## Current slice

- 表・画像・Choice list・AutoShape/コネクタ・JSON / YAML / XML / フラットテキストTree Candidateを同じレビュー画面へ出し、`all / unimported / exclude-imported`を既存ledgerで切り替える。Excel / CSVの親列・Level列から作る推定Treeは、通常レビューを煩雑にしないため専用入口で列を明示してから同じレビュー画面へ渡す。source・import-state・facetはレビューセッション開始時に選び、採用・却下・保留等の後も条件を保持して次Candidateへ進む。処理済みCandidateは同一セッションでは再提示せず、Escで終了する。却下済みCandidateは通常キューから除外し、`all`では復元可能な状態で表示する。
- 採用時は表なら`extractTable`、画像なら`extractImages`、JSON Treeなら`extractJsonTree`を呼び、原本を変更せず標準資産とledgerへ記録する。表の「修正して取り込む」は抽出結果だけを編集し、現在sourceのCandidateを再照合してからcontent-addressedなMarkdownへ確定する。画像の「説明を修正して取り込む」は画像bytesを変えずalt textだけを編集する。JSON Treeはレビュー済みfingerprintと現在sourceを再照合し、変更済みならfail-closeする。表・画像の人手差分がある場合だけ`reviewState: modified`として最終output digestとreview metadataを台帳へ固定する。
- provider-dependent生成を同期QuickPickのcritical pathから外すhost契約を追加した。レビュー開始時はdeterministic inventoryと同じsource snapshotのmemory cacheだけで母集団を固定し、provider laneはbackgroundで更新する。完了結果は開いているレビューへ割り込ませず、次回レビューで反映する。失敗はstatus bar通知に留め、編集・deterministicレビューを継続できる。cacheはsource path・label・digestで分離し、Candidateのprovider/model/artifact identityもsession keyへ保持するため、異なるproviderのEvidenceを黙って統合しない。
- `observed / inferred`、`deterministic / provider-dependent`、provider別Evidenceを合成せず表示する。
- レビューを閉じる操作は通常編集へ影響しない。保留は`mmi.review-decisions/v1`へ永続化し、通常レビューキューから外すが、`すべて`表示では解除できる。
- 却下・保留はimport ledgerと混ぜず、occurrence・content fingerprint・Claim basisへ結び付ける。内容または判断根拠が変われば決定は自動失効し、Candidateが再びレビューへ現れる。
- 利用者観測に備え、設定 `markdownMatrixInjector.reviewObservation.enabled` を追加した。既定は無効。明示的に有効にした場合だけ、実際に選択したledger filterとfacetで決まるレビュー対象をセッションの母集団として固定し、開始・終了時刻、所要時間、提示後に選択した候補数、ledger/review stateの前後と状態遷移をローカルJSONLへ記録する。修正採用では、表本文と画像alt textを分けて元・修正後の文字数と変更区間文字数を集計する。Candidate本文、セル値、修正文、絶対パスは観測記録へ保存せず、外部送信もしない。`editingInterruptionProxy` と修正量は利用者負担を比較するための観測値であり、実際の中断回数や品質スコアそのものとはみなさない。

## Remaining work

- ~~source / Candidate type / epistemic state / execution characteristicの明示フィルタを追加する。~~ → 実装済み。source picker＋import-state filter＋type/status/execution facetを分離し、Candidate契約上の軸を混同しない。
- Windows実機で表・画像・JSON Treeを含むreview → extract → changed/stale表示を確認する。利用者観測では、所要時間、状態遷移、表と画像alt textの修正量を、実際に執筆を中断した回数と合わせて確認する。自動記録だけで受入条件を完了扱いにはしない。
- AutoShape/connectorは同じUIへ接続済み。two-cell anchorでは既存のregion-snapshot生成へ進める。Shape自体のExtracted変換、graphic frame、Note、Section等は各Source Adapterと変換契約を定めた後に追加する。
- provider-dependent host境界は非同期化済み。次は、製品Candidateとして意味が確定した最初のM2/M3 producerをこのlaneへ登録し、実機で「provider待ちなしにレビュー開始」「完了後は次回レビューへ反映」「provider失敗でも編集継続」を確認する。ローカル意味検索やJev/worksheet-format signalを、意味契約なしにCandidateへ流用しない。
- Candidate数が多い場合のページング・検索は連続レビューの実測後に決める。
