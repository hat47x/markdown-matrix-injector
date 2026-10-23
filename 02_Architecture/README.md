# 設計を調べる

ここには、MMIの仕組みを詳しく知りたい方向けの設計資料をまとめています。最初に全体像を知る場合は[概要](../04_Documentation/overview.md)を、実際に操作する場合は[チュートリアル](../04_Documentation/tutorial.md)を先にお読みください。

表をどう読み込んで表示するか、Excelのどの範囲を参照したか、候補をどこまで信頼してよいかなど、知りたい内容から資料を選べます。設計上の言葉や識別子は、コードと照合できるように残しています。

| 目的 | 参照先 |
| --- | --- |
| 参照記法から表示までの処理・コードの責務 | [動作リファレンス](../04_Documentation/how-it-works.md) |
| 記法の意味と変換順序 | [記法仕様](../04_Documentation/spec/mmi-notation-v1.md) |
| VS Code宿主での検証 | [E2E設計](vscode-extension-host-e2e.md) |
| 公開文書の品質 | [文書設計](phase6-public-documentation-architecture.md) |
| 原本座標を保持する読込みと切り出し | [ソースモデル](input-assistance-source-model.md) |
| Excelコピーの出所取得と照合（Windowsの出所取得を含む） | [クリップボード出所と照合](input-assistance-paste-provenance.md) |
| 言葉で表を探す仕組みと検証結果（実装・実測済み） | [CPUでの範囲探索](input-assistance-cpu-search.md) |
| 既存のExcel設計書（方眼紙）の取り込み候補と参照の提案（試作） | [取り込み支援](import-assistance.md) |
| Excelの機能への対応、目録、見出しによる選択、表の目録（試作） | [表の走査と選択](table-navigation.md) |
| 取り込み候補の種類・出典・確認状況を扱う共通ルール（表の読込み機能は実装済み） | [Candidate契約 v1](candidate-contract-v1.md) |
| 入力支援の一次資料と未確認事項 | [技術調査](../01_Plans/input-assistance-technical-research.md) |
| 静的HTMLから断片を選ぶ・保存する・文書間リンクを計画する（試作） | [HTML断片の選択と再構成 v0](html-fragment-decomposition-v0.md) |
| Candidateレビューの作業量を測る基準と、製品へ昇格させる関門（評価契約） | [candidate-review-product-baseline-v1](candidate-review-product-baseline-v1.md) |
| ファイルの内容で原本の同一性を示す契約 | [source-identity-contract-v1](source-identity-contract-v1.md) |
| 記法パラメータの値と、未知のキーの扱い | [notation-parameter-contract-v1](notation-parameter-contract-v1.md) |
| 実装言語に依らない共通Coreの入出力契約 | [portable-core-contract-v1](portable-core-contract-v1.md) |
| Portable CoreのXLSX経路を、Candidateの意味を弱めずに比べる評価基準 | [portable-xlsx-decoder-evaluation-v1](portable-xlsx-decoder-evaluation-v1.md) |
| 決定論的なAuthority Planeと、非権威の認知支援の境界 | [cognitive-assistance-plane](cognitive-assistance-plane.md) |
| 認知model・profile資産のmanifestと、配布・cacheの境界 | [cognitive-artifact-distribution-v0](cognitive-artifact-distribution-v0.md) |
| 表の検索で「見つからなかった依頼」を、同意のもとローカルに数える設計 | [search-observation](search-observation.md) |
| HTML分解のプレビューとリンクの再配置（試作） | [html-decomposition-preview-v0](html-decomposition-preview-v0.md) |
| HTML複数断片の保存と、通常の失敗の検出・回復（試作） | [html-decomposition-batch-commit-v0](html-decomposition-batch-commit-v0.md) |
| SEIの判断の意味論との対応（参考資料） | [sei-decision-semantics-mapping](sei-decision-semantics-mapping.md) |
| Phase 1〜2当時のCore構成の記録（過去の設計。現在の動作は動作リファレンス） | [phase1-core-engine](phase1-core-engine.md) |

実装は`03_Implement/src/`、テストは`03_Implement/test/`。仕様とコードが食い違う場合は、対象と影響を明示して修正する。過去の構成図を現在の設計として扱わない。

## 研究層の設計

次の文書は、`03_Implement/src/experimental/`にある研究層の設計です。製品の契約ではありません。研究層のテストは`npm test`に入れず、`npm run test:research`で実行します。研究の記録は削除せず、ここに残しています。

### 原本への再検証（Authority）（4件）

- [Existing Authority Revalidation Adapter v1](authority-revalidation-adapter-v1.md)
- [Authority Revalidation Receipt v1](authority-revalidation-receipt-v1.md)
- [Authority Verification Overlay v1](authority-verification-overlay-v1.md)
- [Authority Workbook Loader Port v1](authority-workbook-loader-port-v1.md)

### 認知レビューの組み立て（12件）

- [Cognitive Review Envelope v1](cognitive-review-envelope-v1.md)
- [Cognitive Review Presentation v1](cognitive-review-presentation-v1.md)
- [Contained Cognitive Observation v1](contained-cognitive-observation-v1.md)
- [Contained Unified Review Workflow v1](contained-unified-review-workflow-v1.md)
- [Deterministic Review Evidence Overlay v1](deterministic-review-evidence-overlay-v1.md)
- [Executable Proposal Authority Evidence v1](executable-proposal-authority-evidence-v1.md)
- [Executable Proposal Deterministic Review Workflow v1](executable-proposal-deterministic-review-workflow-v1.md)
- [Executable Proposal Verified Review Surface v1](executable-proposal-verified-review-surface-v1.md)
- [Executable Proposal Verified Review Workflow v1](executable-proposal-verified-review-workflow-v1.md)
- [Provider-backed Contained Unified Review v1](provider-backed-contained-review-v1.md)
- [Unified Human Review Presentation Plan v1](unified-human-review-presentation-plan-v1.md)
- [Unified Human Review View Model v1](unified-human-review-view-model-v1.md)

### 判断を出す側（Jev・閉集合判断）（5件）

- [Closed-choice Judgment provider feasibility](closed-choice-judgment-feasibility.md)
- [Closed-choice Judgment Provider Port v1](closed-choice-judgment-provider-port-v1.md)
- [Contained Jev Worksheet Review Entrypoint v1](contained-jev-worksheet-review-entrypoint-v1.md)
- [Jev Choice Judgment Adapter v1](jev-choice-judgment-adapter-v1.md)
- [Jev Worksheet Review Route v1](jev-worksheet-review-route-v1.md)

### 構造化資産とWorksheet書式の観測（8件）

- [Contained Worksheet Format Perception v1](contained-worksheet-format-perception-v1.md)
- [Format Profile v1 — versioned design asset](format-profile-v1.md)
- [MMI Worksheet -> Structured Artifact Neutral Observation Adapter v0](mmi-worksheet-neutral-observation-adapter-v0.md)
- [Profile-backed Fill Review Analysis v1](profile-backed-fill-review-analysis-v1.md)
- [Structured Artifact Neutral Observation v0](structured-artifact-neutral-observation-v0.md)
- [構造候補の範囲修正コスト v0](structured-artifact-range-correction-v0.md)
- [Worksheet Format Fill Review Analysis v1](worksheet-format-fill-review-analysis-v1.md)
- [Worksheet Format Observation Identity v1](worksheet-format-observation-identity-v1.md)

### Worksheet Review Routeの評価（21件）

- [Worksheet Review Route Adjudication Packet v1](worksheet-review-route-adjudication-packet-v1.md)
- [Worksheet Review Route Adjudication Work Allocation v1](worksheet-review-route-adjudication-work-allocation-v1.md)
- [Worksheet Review Route Annotation Packet v1](worksheet-review-route-annotation-packet-v1.md)
- [Worksheet Review Route Annotation Work Allocation v1](worksheet-review-route-annotation-work-allocation-v1.md)
- [Worksheet Review Route Evaluation Packet v1](worksheet-review-route-evaluation-packet-v1.md)
- [Worksheet Review Route Evaluation Plan v1](worksheet-review-route-evaluation-plan-v1.md)
- [Planned Comparison Execution Record JSON Codec v1](worksheet-review-route-evaluation-record-comparison-execution-record-json-codec-v1.md)
- [Worksheet Review Route Comparison Execution Record v1](worksheet-review-route-evaluation-record-comparison-execution-record-v1.md)
- [Worksheet Review Route Evaluation Record Comparison JSON Codec v1](worksheet-review-route-evaluation-record-comparison-json-codec-v1.md)
- [Worksheet Review Route Evaluation Record Comparison Plan JSON Codec v1](worksheet-review-route-evaluation-record-comparison-plan-json-codec-v1.md)
- [Worksheet Review Route Evaluation Record Comparison Plan v1](worksheet-review-route-evaluation-record-comparison-plan-v1.md)
- [Worksheet Review Route Comparison Policy JSON Codec v1](worksheet-review-route-evaluation-record-comparison-policy-json-codec-v1.md)
- [Worksheet Review Route Comparison Policy Result JSON Codec v1](worksheet-review-route-evaluation-record-comparison-policy-result-json-codec-v1.md)
- [Worksheet Review Route Evaluation Record Comparison Change Policy v1](worksheet-review-route-evaluation-record-comparison-policy-v1.md)
- [Worksheet Review Route Evaluation Record Comparison v1](worksheet-review-route-evaluation-record-comparison-v1.md)
- [Worksheet Review Route Evaluation Record JSON Codec v1](worksheet-review-route-evaluation-record-json-codec-v1.md)
- [Worksheet Review Route Evaluation Record v1](worksheet-review-route-evaluation-record-v1.md)
- [Worksheet Review Route Evaluation Runner v1](worksheet-review-route-evaluation-runner-v1.md)
- [Worksheet Review Route Evaluation v1](worksheet-review-route-evaluation-v1.md)
- [Worksheet Review Route Label Corpus v1](worksheet-review-route-label-corpus-v1.md)
- [Worksheet Review Route Evaluation Readiness v1](worksheet-review-route-readiness-v1.md)
