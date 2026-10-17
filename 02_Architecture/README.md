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

実装は`03_Implement/src/`、テストは`03_Implement/test/`。仕様とコードが食い違う場合は、対象と影響を明示して修正する。過去の構成図を現在の設計として扱わない。
