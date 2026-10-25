# 設計を調べる

ここには、MMIの仕組みを詳しく知りたい方向けの設計資料をまとめています。最初に全体像を知る場合は[概要](../04_Documentation/overview.md)を、実際に操作する場合は[チュートリアル](../04_Documentation/tutorial.md)を先にお読みください。

表をどう読み込んで表示するか、Excelのどの範囲を参照したか、候補をどこまで信頼してよいかなど、知りたい内容から資料を選べます。設計上の言葉や識別子は、コードと照合できるように残しています。

| 目的 | 参照先 |
| --- | --- |
| 参照記法から表示までの処理・コードの責務 | [動作リファレンス](../04_Documentation/how-it-works.md) |
| 記法の意味と変換順序 | [記法仕様](../04_Documentation/spec/mmi-notation-v1.md) |
| VS Code宿主での検証 | [E2E設計](vscode-extension-host-e2e.md) |
| 納品用PDFに求められる体裁と現状の差分 | [納品用PDF出力](delivery-pdf-output.md) |
| 公開文書の品質 | [文書設計](phase6-public-documentation-architecture.md) |
| 原本座標を保持する読込みと切り出し | [ソースモデル](input-assistance-source-model.md) |
| Excelコピーの出所取得と照合（Windowsの出所取得を含む） | [クリップボード出所と照合](input-assistance-paste-provenance.md) |
| 言葉で表を探す仕組みと検証結果（実装・実測済み） | [CPUでの範囲探索](input-assistance-cpu-search.md) |
| 既存のExcel設計書（方眼紙）の取り込み候補と参照の提案（試作） | [取り込み支援](import-assistance.md) |
| Excelの機能への対応、目録、見出しによる選択、表の目録（試作） | [表の走査と選択](table-navigation.md) |
| 取り込み候補の種類・出典・確認状況を扱う共通ルール（表の読込み機能は実装済み） | [Candidate契約 v1](candidate-contract-v1.md) |
| 入力支援の過去の調査記録 | [技術調査](../04_Documentation/history/input-assistance/input-assistance-technical-research.md) |
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

現行の不足は[製品価値との差分](product-gap-analysis.md)、未採用案と検討根拠は[調査資料](research/README.md)を参照する。個別の進行状況はGitHub Issueを正本とする。
