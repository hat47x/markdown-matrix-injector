# 現在の作業

## 現況

**製品方針:** [ADR-0019](adr/ADR-0019-ai-era-sier-document-value-and-policy.md)（2026-10-01採択・同日改訂）により、MMIは**人が慣れた道具で書き続けたまま、その内容をAIと機械が扱える形へ緩やかに移し、最終的には元文書やMMIからも安全に切り離せる基盤**である。MMIは、Excel方眼紙をレガシーとみなす見方と既存のスタイルの両方を否定せず、両者の橋になる。Excelで書き続ける人はそのままAIと協業でき、Markdownへ移りたい人は資産を失わずに移れる。図形やレイアウトに意味があるシート・範囲は、そのまま画像として取り込んでよい（D0）。Linked（参照）・Extracted（取り込み）・Detached（切り離し）は情報単位ごとに選ぶ状態で、順に進む段階ではない。人の作業を止めないことを移行の速さより優先する（D13）。表参照・Read-only・決定論的なAuthority Planeは中核の保証として継続し、軽量認知は表・画像・図形・ツリー等の候補（Semantic Candidate）を見つける非権威的な支援とする。

**実装の到達点:** Linkedは表で実装済み。Extractedは表・Excel埋込画像の選択的取り込みが同じCandidate/ledger系で成立し、`inspect`でCandidateを列挙し、`extract`で標準Markdownまたは画像assetsへ取り込み、`mmi-ledger.json`でoccurrence/content/review basis・変更・lineage・研究類似Evidenceを追跡できる。VS Codeでは表・画像Candidateを執筆後に同じレビュー画面から選び、既存extract経路へ渡す最小UIがある。Detachedも最小縦切りが入り、`materialize`でMMI参照を標準Markdownへ実体化し、`detach-check`で残存参照・未実体化marker・壊れた/境界外リンクを検査できる。図形・Tree等のExtracted一般化、ledgerと採用関係を用いた完全性監査、実務E2Eは未完。CLIは`inspect`・`extract`・`check`・`render`・`materialize`・`detach-check`・`manifest`・AI handoff/再検証を提供する。AI向け指示パック（`skills/mmi`）、基本設計書キット、執筆ベンチマーク v0もある。記法仕様はDraft、配布物は公開準備中の検証版。差分の詳細は[ギャップ分析](product-gap-analysis.md)を参照する。

## 優先度と作業

ADR-0019の優先度に、既存のIssueを含めて対応付ける。上から順に割り当てるが、下位の作業を禁止しない。

| 優先度 | 作業 | 状態 | 次の一手 |
| --- | --- | --- | --- |
| **1 Coreと入口** | [Candidate・Source Adapter・provenanceの契約](issues/issue-0193-candidate-source-adapter-contract.md) | **Done**（契約 v1。表・画像Candidateが利用） | 次の一般化はTree/Shape等のSource Adapterへ |
| 1 | CLI（inspect/check/render/manifest）、AI向け指示パック、基本設計書キット、[執筆ベンチマーク](../04_Documentation/benchmarks/ai-writing/README.md) | 実装済み | ベンチマーク v0は実施済み。表を大きくした v1は優先度5 |
| 1 | [外部LLMへの作業提案と判断材料](issues/issue-0112-ai-proposal-handoff.md) | **In Progress**（local-only handoff、MMI記法・Candidate選択案のfail-closed再検証） | 次: 変換案も同じAuthority境界で再検証する |
| 1 | [CLIの配布](issues/issue-0197-cli-distribution.md) | Draft | 配布形態の決定 |
| 1 | [portable coreと最小バイナリ](issues/issue-0203-portable-core-minimum-binary.md) | Draft | VS Code非依存Core境界を固定し、標準Go/TinyGo/native/WASMを同一契約で実測比較 |
| 1〜3（横断） | [認知model/profile資産の配布](issues/issue-0204-cognitive-artifact-distribution.md) | Draft | Coreと大型artifactを分離し、既存local runtime/cacheと外部model置き場を交換可能にする |
| **2 モダナイズの最小縦切り** | [Excel画像の候補化と取り込み](issues/issue-0194-excel-image-candidates.md) | **Done**（`inspect`の画像一覧、`mmi extract`、実Excel検証、issue-0195による変更検知） | 次: VS Code上の採否UI（issue-0202）、他Candidate種別への展開 |
| 2 | [取り込み台帳と未取込の表示](issues/issue-0195-import-ledger.md) | **Done**（`mmi.ledger/v1`、未取込/変更/stale、lineage、研究similarity Evidence） | 次: issue-0200のbaseline converter、issue-0202のレビューUIが同じ台帳契約を利用 |
| 2 | [初回一括変換とCandidate基盤の接続](issues/issue-0200-baseline-bulk-import.md) | **In Progress**（MarkItDown評価・handoffは整備、実変換の導入判断は未確定） | Candidate・ledgerとの接続条件を保ったまま、デスクトップ実行結果でconverter採否を判断 |
| 2 | [シート・範囲の画像化](issues/issue-0198-sheet-region-snapshot.md) | Draft | CIで動く描画方式（MMI自身の描画、LibreOffice）の比較。COMは手元の補助 |
| 2 | [人の作業を止めないCandidateレビューUI](issues/issue-0202-candidate-review-ui.md) | **In Progress**（表・画像、import state＋type/status/execution facet、採用/却下/却下解除/保留を同じレビュー経路へ接続） | 修正して採用、Windows実機E2E、利用者観測 |
| 2 | [既存設計書の取り込み候補](issues/issue-0205-import-assistance-prototype.md)（方眼紙の表の参照提案・役割候補・下書き） | In Progress（試作、架空データで評価済み） | 残: VS Code宿主での確認、実在の設計書での観測 |
| 2 | [Excelを開かずに表・列・行を選ぶ入口](issues/issue-0206-table-navigation-and-agent-interface.md)（名前・テーブル・非表示、見出しによる選択） | In Progress（試作） | 残: 目視確認、[ADR-0022](adr/ADR-0022-semantic-selection-in-notation.md)の採否、CLIのselect/findをissue-0193のCandidate契約へ統合 |
| 2（既存） | [Excel範囲貼り付け](issues/issue-0114-excel-range-paste.md) | Open | Paste As宿主dispatchの自動E2Eを追加済み（実行確認待ち）。残: Windows実ExcelのHTML/helper/視覚picker実機証拠。表Candidateを`confirmed`にする経路として扱う |
| 2（既存） | [CPUでの範囲探索](issues/issue-0115-cpu-range-search.md) | In Progress | 言い換え対応。Candidateの検索として扱う |
| 2（既存） | [文脈に応じた補完](issues/issue-0110-contextual-input-completion.md)、[参照の作成・編集](issues/issue-0111-reference-authoring-flow.md) | In Progress | 多環境の実機確認、利用者の観測 |
| **3 Source Adapterの一般化** | [Tree / Hierarchy、JSON/XML、フラットテキスト](issues/issue-0199-tree-structured-source-adapters.md) | Draft | issue-0193の共通契約後に、明示構造→推定構造の順で縦切り |
| 3 | Shape、Choice list | 未起票 | issue-0193・0199でNode/Candidate表現を固めてから起票 |
| 3（研究） | structured artifact（SAI）、worksheet format、[review route](issues/issue-0190-review-route-evaluation-pipeline-regression.md) | In Progress | 新しい研究段階は、issue-0193の対応表のどの行を強くするかを示してから始める |
| **4 Detachability** | [実体化とdetach check](issues/issue-0196-materialize-detach-check.md) | **In Progress**（表・別紙・ローカル画像のmaterialize、採用済みExtracted Candidateのfreshness preflight、artifact closureを実装） | build/unitと実務E2Eを確認し、Tree/Shape等がExtracted可能になったら同じprovenance/freshness契約へ拡張 |
| 4 | 参照台帳と影響分析 | 未起票 | issue-0195の台帳と合わせて設計 |
| **5 組織導入** | 文書キットの追加、CI関門、執筆ベンチマーク v1（大きな表・複数シート・本文と表の矛盾） | 未起票 | 優先度2の縦切りの後 |
| 5 | [外部の判断記録からの根拠の固定（SEI）](issues/issue-0192-sei-decision-basis-table-binding.md) | Draft | CLIの契約が固まった後 |
| 横断 | [上位プロダクト名とMMI互換層の整理](issues/issue-0201-product-name-and-compatibility-layer.md) | Draft | 実装を止めずに検討。決定前はrepo/package/CLI名を変更しない |
| 3（認知候補） | [ローカル認知runtime評価](issues/issue-0113-local-ai-feasibility.md) | Draft | M0〜M2で不足する具体的taskが定まったら、Ollama / LM Studio等の導入済みruntimeを含め比較評価 |

**優先度の根拠:** 執筆ベンチマーク v0では、小さな表をAIが誤って写すことはなく、MMIの差は正本の変更への追従に出た（[結果](../04_Documentation/benchmarks/ai-writing/results/2026-09-30-v0.md)）。人がExcelで書き続けても追従する（Linked）ことは、それだけで価値がある。そのうえで、人がExcel等に置いた表・画像を選択的に標準資産へ移し、同じledgerとレビュー経路で追跡できるExtractedの経路が次に価値が大きい。Detachedは、原本を廃止すると決めた範囲のための経路として優先度4に置き、最小materialize/check縦切りまで実装した。その入口がCandidateの契約（issue-0193）で、研究の成果を製品へ合流させる唯一の経路でもあるため、最上位に置く。

**AI境界:** MMI自身は原則として課金型生成AIサービスを呼ばない。外部LLMはMMIを利用する側に置き、MMI内部の認知はFly-inspired、Jev類似技術、ローカルLLM等の軽量・ローカル方式を候補とする。外部LLMの判断が有用な場合は、MMIがprompt / evidence packageをローカル生成し、送信は利用者側へ委ねる（ADR-0018 D8・D11、ADR-0019 D15）。

**認知方式:** [ADR-0020](adr/ADR-0020-requirement-oriented-cognition-method-selection.md)により、認知はLLM等に限定せず、M0明示抽出 → M1決定論的推定 → M2軽量類似 → M3 bounded Judgment → M4 local generative → M5 external handoffを要件ごとに比較する。最も単純で十分な方式を優先し、`observed/inferred`と`deterministic/provider-dependent`を直交して扱う。provider-dependent処理は編集・CIの主経路から外す。

## 確定した事実

- **原本座標:** Excel読込みは原本座標を保持するソースモデル（`SheetSource`）で、使用範囲の原点と空行を失わない。
- **クリップボード:** VS Codeの`DataTransfer`はExcelの出所形式を公開しない。Windowsの補助プロセスで出所を取得する[ADR-0017](adr/ADR-0017-windows-clipboard-provenance-bridge.md)の選択肢2を採用し、設定付き・既定オンで実装・実機検証済み（2026-09-25）。
- **画像:** SheetJS（コミュニティ版）の`bookFiles`からOOXML drawing/mediaを読み、画像Candidate化・抽出を実装済み。実Excelブックでanchorと抽出bytesを照合済み。

## 開発環境

WSL2 Ubuntu（Node v20、npm 10、Python 3.12）で`npm ci`・`npm run build`・`npm test`を実行する。Windows側のこの環境にはNode.jsと実体のあるPython 3が無い。VS Code実機の操作はWindows側で行う。`npm test`では、研究層の26件が実装の変更と無関係に失敗する（2026-09-27時点。変更前のHEADでも同じ）。

## 計画の管理

依頼に該当するIssueを読み、受入条件と次の作業を確認する。一覧が必要な場合はリポジトリルートで実行する。

```sh
python 01_Plans/tools/planning_queue.py
```

Draftは検討中であり、採用・実装済みを意味しない。重要な選択は[ADR](adr/TEMPLATE.md)、実行内容は[Issue](issues/README.md)へ記す。入力支援の経緯は[企画](input-assistance-proposal.md)・[設計レビュー](input-assistance-design-review.md)・[技術調査](input-assistance-technical-research.md)にある。日々の経緯や完了作業の一覧はこのページへ追加しない。
