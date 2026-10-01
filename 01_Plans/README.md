# 現在の作業

## 現況

**方針案（採否待ち）:** [ADR-0019](adr/ADR-0019-ai-era-sier-document-value-and-policy.md)は、製品価値を「AIが書いても、人が書いても、表は正本どおり」と定め、AIエージェント経路とVS Codeでの手動編集経路の2つを育てる案。優先度は、1.AIから使える最小経路（CLI、AI向け指示パック、基本設計書キット、執筆ベンチマーク）、2.研究層の成果を既存文書の取り込み操作へつなぐこと、3.参照台帳・確定版などSIer品質の保証、4.組織への展開の順。要件の範囲は変えない。採否が決まるまで、下の作業順は現行のままとする。

VS Code拡張、記法仕様、日本語チュートリアル、実務サンプルを整備している。記法仕様はDraft、配布物は公開準備中の検証版。新しい入力支援はレビュー指摘R1〜R5を設計・ADR・観測ハーネスへ反映済み（[作業A完了](issues/issue-0114-excel-range-paste.md)）、**原本座標の保持（作業B）も実装・自動テスト完了**（2026-09-11、WSL2 Ubuntu環境）、**VS CodeのDataTransfer観測（作業C）も完了**（同日、Windows実機）。**作業D（内容照合による貼り付け）と`editor.action.pasteAs`への統合も完了**（2026-09-16〜17）。**CPUでの範囲探索（issue-0115）は評価実装と実測を終え、FlyHashは条件付き採用**（2026-09-24）。

**解決済みの問題:** Excel読込みで空行と使用範囲の原点が失われ、正しい参照文字列を挿入しても原本と違う位置が表示される問題を、原本座標を保持するソースモデル（`SheetSource`）へ置き換えて修正した。`npm test`全258件成功、実サンプルでの回帰0件、旗艦の再現ケース（`設計.xlsx#状態遷移|C5:F12`）が設計文書どおりの出力になることを実描画で確認済み。

**確定した事実（作業C）:** VS Codeの`DataTransfer`はExcelの出所形式を一切公開しない。実機で`text/plain`・`text/html`・`text/rtf`・`image/png`の4件のみを確認し、`SourceURL`を含むCF_HTMLヘッダーもVS Code側で失われることを確認した。[ADR-0017](adr/ADR-0017-windows-clipboard-provenance-bridge.md)の選択肢1（拡張内だけで完結）は却下確定。選択肢2（Windows補助プロセス）を実装するかは未決定だが、段2の実装（内容照合ベース）はこの判断を待たずに進められる。

## 入力支援の作業順

| 順序 | 作業 | 状態 | 着手できるか |
| --- | --- | --- | --- |
| 1 | [Excel範囲貼り付け・座標保持](issues/issue-0114-excel-range-paste.md) | Open（作業B・C・D完了。残: pasteAs経路のe2e、ADR-0017の判断） | 残作業のみ |
| 2 | [文脈に応じた補完](issues/issue-0110-contextual-input-completion.md) | In Progress（カーソル区間の置換・値候補・選んだシートの表だけの範囲候補を実装） | 残: 多環境（multi-root・IME・Undo等）の実機確認 |
| 3 | [参照の作成・編集](issues/issue-0111-reference-authoring-flow.md) | In Progress（案内付きコマンド・部分更新・実エンジンの確認・修正候補・ホバーを実装） | 残: 利用者の実機観測 |
| 4 | [CPUでの範囲探索](issues/issue-0115-cpu-range-search.md) | In Progress（`MMI: Find Table by Description`として組み込み。最新の未見評価でRecall@5 0.800、FlyHashは条件付き採用） | 次は言い換えへの対応 |
| 5 | [既存設計書の取り込み候補](issues/issue-0192-import-assistance-prototype.md)（[ADR-0019](adr/ADR-0019-ai-era-sier-document-value-and-policy.md) 優先度2の試作） | In Progress（方眼紙の表を表として描く参照の提案、役割の候補、書式のまとまり、下書き。架空データで評価済み） | 残: VS Code宿主での確認、実在の設計書での観測 |
| 6 | [Excelを開かずに表・列・行を選ぶ入口（人とAI）](issues/issue-0193-table-navigation-and-agent-interface.md)（ADR-0019 経路A・B） | In Progress（名前・テーブル・非表示の読込み、目録、見出しによる選択、CLI、VS Codeの表の目録） | 残: 目視確認、AIエージェントでの確認、[ADR-0020](adr/ADR-0020-semantic-selection-in-notation.md)の採否 |
| 任意 | [既存AIへの依頼と結果検証](issues/issue-0112-ai-proposal-handoff.md) | Draft | 主経路外。0115の評価後に要否を再判断 |
| 保留 | [ローカルLLM評価](issues/issue-0113-local-ai-feasibility.md) | Draft | 着手しない |

**開発環境:** WSL2 Ubuntu（Node v20.20.2、npm 10.8.2、Python 3.12.3、git 2.43.0）で`npm ci`／`npm run build`／`npm test`を実行できることを確認済み。Windows側のこの調査環境自体にはNode.js・npm・実体のあるPython 3が無い（`python`はMicrosoft Storeのスタブ）。実装はWSL2側で行う。VS Code実機操作（DataTransfer観測・GUIでの貼り付け）はWindows側でのみ可能で、こちらは動作確認済み。

- [企画](input-assistance-proposal.md): 利用体験と対象範囲。
- [技術調査](input-assistance-technical-research.md): 確認済みの事実、未確認事項、検証手順。
- 設計: [ソースモデル](../02_Architecture/input-assistance-source-model.md)、[クリップボード出所と照合](../02_Architecture/input-assistance-paste-provenance.md)、[CPUでの範囲探索](../02_Architecture/input-assistance-cpu-search.md)、[取り込み支援](../02_Architecture/import-assistance.md)。
- [認知機能の仮説カード](cognitive-hypothesis-cards.md): 認知補助の各機能の証拠の段階と次の一手（ADR-0019 D9の形式）。
- [ADR-0016](adr/ADR-0016-notation-first-input-assistance.md): 入力支援の方針と確定した設計判断。[ADR-0017](adr/ADR-0017-windows-clipboard-provenance-bridge.md): 出所取得の条件付き判断。いずれもProposed。

## 計画の管理

依頼に該当するIssueを読み、受入条件と次の作業を確認する。作業一覧が必要な場合だけ、リポジトリルートで実行する。

```sh
python 01_Plans/tools/planning_queue.py
```

Draftは検討中であり、採用・実装済みを意味しない。ユーザーの依頼範囲と依存関係を確認して着手する。重要な選択は[ADR](adr/TEMPLATE.md)、実行内容は[Issue](issues/README.md)へ記す。日々の経緯や完了作業の一覧はこのページへ追加しない。

## 次の着手条件

[設計レビューと作業指示](input-assistance-design-review.md)のA〜Fを作業順とする。A〜Dは完了（作業Dは内容照合＋明示候補選択。自動確定はしない）。自動確定とWindows橋渡し（作業E、[ADR-0017](adr/ADR-0017-windows-clipboard-provenance-bridge.md)選択肢2）はR1/R4を満たすまで着手しない。CPU探索の次の作業は[issue-0115](issues/issue-0115-cpu-range-search.md)の「残り」を参照。
