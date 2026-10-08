# Issue: 表の検索で「見つからなかった依頼」の種類を、同意のもとローカルに数える

## Meta
- Type: Feature / Evaluation
- Status: Draft（設計済み。2026-10-08）
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

- [ ] 既定で何も記録しない。設定をオンにしたときだけ記録し、最初に記録する内容を一度示す。
- [ ] 依頼文・表名・ファイル名・利用者名を記録しない（`includeText`をオンにした場合の依頼文を除く）。型と単体テストで、既定の記録に依頼文が入らないことを固定する。
- [ ] 保存先はワークスペース単位のローカル領域で、リポジトリ内に置かない。1,000件の循環とし、コマンドで集計・書き出し・消去できる。外部への送信経路を持たない（ネットワークを使うコードを含まないことを確認する）。
- [ ] 分類は決定論の規則で行い、規則ごとに単体テストを置く。分類の規則を変えたら記録の版を上げる。
- [ ] 記録は検索の応答を遅らせない（記録の失敗は検索に影響しない）。
- [ ] 集計は件数と割合だけで、分類×結末の表と、適合度の区間ごとの先頭選択率、別名の提案の受け入れ率を出す。
- [ ] 記録の有無で、検索結果の順位・候補の有無が変わらないことを、同じ入力で比較するテストで確認する。
- [ ] 設計文書§7の判断基準を、観測の開始前にこのIssueへ転記し、結果を見てから変更しない。

### Validation plan

分類・記録・集計は、拡張機能ホストなしの単体テストで試験する。セッションの入口（開始・終了・選択の検知）は、拡張機能ホストのE2Eで、候補を選ぶ・閉じる・入力を直すの各経路を確認する。実利用の観測は、複数の利用者が一定期間使い、集計を持ち寄る。件数が100に満たない間は、傾向を断定しない。

## Remaining work

- 実装（設計文書§8の分担）。
- 設定のうち`includeText`は、利用者がローカルでの見直しのためにオンにする場合の注意文を決める。
- 観測を実在の設計書の利用者へ依頼する範囲・期間は、Human Sponsorが決める。
