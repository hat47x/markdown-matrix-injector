# Issue: 表の検索で「見つからなかった依頼」の種類を、同意のもとローカルに数える

## Meta
- Type: Feature / Evaluation
- Status: In Progress（純粋分類・記録・ローカル保存・集計とVS Code検索セッション接続を実装。2026-10-08）
- Priority: Medium
- Scope: `src/search/observation/`（分類・記録・保存・集計）、`src/dx/searchFlow.ts`（セッションの入口）、設定とコマンド
- Expected verification level: unit / manual-e2e

## Traceability
- Related ADR/Spec: [ADR-0023](../adr/ADR-0023-fuzzy-search-before-paraphrase-and-model-runtime.md)（Decision 4: 需要を測る）、[ADR-0018](../adr/ADR-0018-cognitive-assistance-plane.md)（外部送信の禁止）
- Related Design: [表の検索の需要観測](../../02_Architecture/search-observation.md)
- Related Issue: [issue-0115](issue-0115-cpu-range-search.md)、[issue-0113](issue-0113-local-ai-feasibility.md)（再開の前提）

## Execution Plan

### Proposed solution

設計文書のとおり。検索画面の1回を1セッションとして、最後の依頼の分類（略語・表記ゆれ・言い換え・該当なし・未対応の操作）、結末、選んだ候補の順位と適合度、別名の提案の結果をローカルに記録し、件数だけの集計を利用者が見られるようにする。既定はオフで、依頼文は記録しない。

### Acceptance criteria

- [x] 既定で何も記録しない。設定をオンにしたときだけ記録し、最初に記録する内容を一度示す。
- [x] 依頼文・表名・ファイル名・利用者名を記録しない（`includeText`をオンにした場合の依頼文を除く）。型と単体テストで、既定の記録に依頼文が入らないことを固定する。
- [x] 保存先はワークスペース単位のローカル領域で、リポジトリ内に置かない。1,000件の循環とし、コマンドで集計・書き出し・消去できる。外部への送信経路を持たない（ネットワークを使うコードを含まないことを確認する）。
- [x] 分類は決定論の規則で行い、規則ごとに単体テストを置く。分類の規則を変えたら記録の版を上げる。
- [x] 記録は検索の応答を遅らせない（記録の失敗は検索に影響しない）。
- [x] 集計は件数と割合だけで、分類×結末の表と、適合度の区間ごとの先頭選択率、別名の提案の受け入れ率を出す。
- [ ] 記録の有無で、検索結果の順位・候補の有無が変わらないことを、同じ入力で比較するテストで確認する。
- [x] 設計文書§7の判断基準を、観測の開始前にこのIssueへ転記し、結果を見てから変更しない。

#
## 判断基準の事前固定（観測開始前）

設計文書§7の基準を、実データを見る前に本Issueへ固定する。観測結果に合わせて後から閾値を動かさない。変更する場合は、既存観測とは別version・別判断として扱う。

| 条件 | 解釈 | 次の判断 |
| --- | --- | --- |
| 分類が確定した「見つからなかった依頼」が合計100件以上で、3人以上の利用者が含まれる | 判断に足る量 | 下の行を適用する |
| description が10%未満 | 言い換えの需要は小さい | ADR-0023の据え置きを維持する。評価セットの言い換えの配分を下げる |
| description が25%以上 | 言い換えの需要は無視できない | モデルの導入条件（ADR-0023 Decision 3）のうち「別の用途の記録」を探す。単独では導入しない |
| abbreviation が最多 | 略語の層が主戦場 | 実在文書で略語の併記・略語表の有無を観測する |
| notation が最多 | 正規化の不足 | 表記ゆれ規則を、新しい未見セットで見直す |
| 先頭選択率が適合度の区間と無関係 | 適合度が当てにならない | 適合度の式を見直すか、表示をやめる |

100件に満たない間は傾向を断定しない。

## Implementation checkpoint (2026-10-08)

`src/search/observation/`に、VS Code非依存の観測契約を追加した。`mmi.search-observation/v1`は日付、検索回数、最終状態、分類、語数、英字語数、疑問形、結末、選択順位・fit・basis、別名提案の結果、所要時間だけを持つ。既定では依頼文を含めず、`includeText`が明示された場合だけ`final.text`を追加する。

分類は `found → unsupported-op → notation → abbreviation → description → no-such-table → other` の決定論的順序で固定した。description判定は検索本体と同じ`isDescriptionQuestion`と、構造的near-miss evidenceを再利用する。分類規則の版は`classifierVersion: 1`としてrecordへ保存する。

保存は`ExtensionContext.storageUri/search-observations.json`だけを使う。通常のworkspace treeや`.mmi`へ自動保存しない。最大1,000件で古いrecordから循環する。検索セッション側は表示された検索結果が確定した後だけrecordを組み立て、保存は`void Promise.resolve(...).catch(...)`でcritical pathから外した。保存・集計の失敗を検索結果へ返さない。

設定は`markdownMatrixInjector.search.observation.enabled`（既定false）と`search.observation.includeText`（既定false）を追加した。有効化後の最初の検索では、保存内容と外部送信しないことを一度だけmodal表示する。

コマンドは「集計」「件数集計のMarkdown書き出し」「全消去」を追加した。集計は分類×結末、fit区間ごとの先頭選択率、別名提案の受入率だけを出し、依頼文・表名・ファイル名・利用者名を出力しない。

`test/searchObservation.test.ts`では、分類順序、既定JSONから依頼文・Candidate名・ファイル名が消えること、明示opt-in時だけ依頼文が入ること、1,000件循環、消去、件数集計とfit/alias較正を固定した。

## Validation plan

分類・記録・集計は、拡張機能ホストなしの単体テストで試験する。セッションの入口（開始・終了・選択の検知）は、拡張機能ホストのE2Eで、候補を選ぶ・閉じる・入力を直すの各経路を確認する。実利用の観測は、複数の利用者が一定期間使い、集計を持ち寄る。件数が100に満たない間は、傾向を断定しない。

## Remaining work

- 拡張機能ホストE2Eで、候補選択・near-miss選択・入力修正後選択・キャンセル・別名提案のaccepted/declinedが1セッション1recordになることを確認する。
- 観測オン/オフで同じ検索入力の候補順・候補集合が一致する回帰を追加し、受入条件を閉じる。
- 設定のうち`includeText`は、利用者がローカルでの見直しのためにオンにする場合の注意文を決める。
- 観測を実在の設計書の利用者へ依頼する範囲・期間は、Human Sponsorが決める。
