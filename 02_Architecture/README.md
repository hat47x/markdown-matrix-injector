# 設計を調べる

| 目的 | 参照先 |
| --- | --- |
| 参照記法から表示までの処理・コードの責務 | [動作リファレンス](../04_Documentation/how-it-works.md) |
| 記法の意味と変換順序 | [記法仕様](../04_Documentation/spec/mmi-notation-v1.md) |
| VS Code宿主での検証 | [E2E設計](vscode-extension-host-e2e.md) |
| 公開文書の品質 | [文書設計](phase6-public-documentation-architecture.md) |
| 原本座標を保持する読込みと切り出し | [ソースモデル](input-assistance-source-model.md) |
| Excelコピーの出所取得と照合（Windowsの出所取得を含む） | [クリップボード出所と照合](input-assistance-paste-provenance.md) |
| 索引・自然言語解析・候補検索（実装・実測済み） | [CPUでの範囲探索](input-assistance-cpu-search.md) |
| Semantic Candidate・Source Adapter・provenanceの共通契約（表のAdapter実装済み） | [Candidate契約 v1](candidate-contract-v1.md) |
| 入力支援の一次資料と未確認事項 | [技術調査](../01_Plans/input-assistance-technical-research.md) |

実装は`03_Implement/src/`、テストは`03_Implement/test/`。仕様とコードが食い違う場合は、対象と影響を明示して修正する。過去の構成図を現在の設計として扱わない。
