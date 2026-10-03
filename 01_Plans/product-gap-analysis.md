# 製品価値と現行実装のギャップ

- 基準: [ADR-0019](adr/ADR-0019-ai-era-sier-document-value-and-policy.md)（2026-10-01 Accepted）と[製品要求](../00_Prompt/requirements.md)
- 測定日: 2026-10-03（Candidate・表/画像Extracted・import ledger、表の修正採用、既存ブックのハイブリッド取り込み、Detachedの最小materialize/check縦切りまで反映）
- 本書は差分の地図であり、作業順の正本は[現在の作業](README.md)とする。差分が解消したら行を消し、経緯は書き足さない。

## 1. 要約

MMIはLinked（参照）を表で実装済みで、Extracted（取り込み）も表・Excel埋込画像の選択的取り込みまで成立した。両者は共通Candidateとimport ledgerを使い、取込済み・変更・stale・lineage・研究類似Evidenceを追跡できる。VS Codeでは表・画像を同じ後追いレビュー画面から既存extract経路へ渡せる。初回取り込みでは、表をLinkedのまま残し、.xlsx/.xlsmの埋込画像だけをExtracted assetへ移すハイブリッド経路をVS CodeとCLIで共有する。Detachedも表の標準Markdown化とartifact closure checkの最小縦切りが入った。ADR-0019 D0・D13のとおり、人がExcelで書き続ける情報はLinkedのままでよく、Linkedは過渡期の仮の姿ではない。残る大きな差分は図形・Tree等へのExtracted一般化、レビュー操作の完成、実在設計書での取り込み観測、Detachedの完全性監査と実務E2Eである。

| 状態 | 実装 | 主な不足 |
| --- | --- | --- |
| Linked | 実装済み（表のみ）。VS Code・CLIの両方から使える | 画像・図形・ツリーの参照がない |
| Extracted | **一部実装**（表・Excel埋込画像。共通Candidate/ledger、選択的extract、表・画像レビューUI、facet絞り込み、内容・Claim basisへ結び付く却下decision。表は抽出結果、画像はalt textを人手修正して`modified`として採用可能。初回取り込みでは表Linked＋画像Extractedを併用） | 図形・Tree等のextract、実在設計書での観測、実機E2E |
| Detached | **一部実装** | `materialize`で表・カード相当表を通常Markdownへ、ローカル画像をcontent-addressed assetへ実体化する。文書へ採用済みのExtracted表/画像はprovenance + ledger + current Candidateでfreshness確認し、`detach-check`でclosureを検査できる。実務E2Eと非表Candidate拡張は未完 |

Candidateの共通契約はissue-0193で実装済みで、表・画像が利用している。現在の主なギャップは、研究層の成果をCandidate検索・属性として製品面へ接続すること、画像以外のExtractedを増やすこと、人の作業を止めないレビューUI、実在設計書での取り込み観測、Detachedである。新しい研究段階を独立に増やすより、既存成果をこれらの製品経路へ接続する作業を優先する。

## 2. 能力ごとの差分

状態の記号: ●実装済み、◐一部、○未実装。「証拠」は実装の場所または測定。

| 製品要求の能力 | 状態 | 現在あるもの（証拠） | 不足 | 優先度 |
| --- | --- | --- | --- | --- |
| 参照 | ● | MMI Notation v1、VS Codeプレビュー、CLI `render` | 表以外のCandidateの参照 | 2〜3 |
| 目録 | ◐ | CLI `inspect`（表の領域・見出し・行数、Excel画像の位置・形式・ダイジェスト・近くの表、`--json`のCandidate形式。`src/cli/mmi.ts`） | 図形・注記・リンクの列挙 | 2〜3 |
| 候補抽出 | ◐ | 共通Candidate型を実装し、表・Excel画像を`mmi inspect --json`へ出力。表Candidateは結合した方眼紙の表を論理列で認識し、参照に`columns=`・`mode=table`を含める（`extract`も論理表を出力。2026-10-03）。研究: 表らしさ・見出し境界（structured artifact）、既知書式（worksheet format） | Tree/Shape等のCandidate化、研究成果の製品接続 | 1〜3 |
| 個別取り込み | ◐ | CLI `extract`でExcel画像を通常画像assetへ、検出済みTable Candidateを標準GFM Markdown assetへ選択的に取り込む。VS Codeではimport stateとtype/status/executionで絞り、採用・却下・却下解除・保留を行える。表は抽出後のMarkdown、画像はalt textを人が修正し、Candidate由来を維持したまま`reviewState: modified`と最終output digestを記録できる。却下・保留は内容またはClaim basisが変わると自動失効する | 図形・Tree・構造化データのextract、実機E2E | 2 |
| 一括変換 | ◐ | VS Codeの既存取り込みコマンドとCLI `mmi import`が同じmaterializerを使い、表をLinked参照、.xlsx/.xlsmの埋込画像をExtracted asset＋取り込み台帳として1回で下書き化する。非表領域と画像の問題は確認事項として残す | 実在設計書での観測、図形等の追加Candidate、外部Converterとの比較評価（[issue-0200](issues/issue-0200-baseline-bulk-import.md)） | 2 |
| 重複回避 | ● | Candidate単位のfingerprint、`mmi.ledger/v1`、`imported/changed/stale/duplicate/unimported`、`--unimported` / `--exclude-imported`、lineage・similarity Evidence分離 | UIからの利用はissue-0202、一括変換からの登録はissue-0200 | 2 |
| シートの画像化 | ○ | Windows補助プロセスの前例（ADR-0017、クリップボード） | 図形・レイアウトに意味があるシート・範囲を画像として取り込む`Sheet / Region snapshot`（ADR-0019 D0）。CIで再現できる描画を優先し、COMは手元の補助（ADR-0019 D14。いずれも未検証） | 2 |
| 構造化 | ○ | なし（研究に階層関係のラベル`region.hierarchy_relation`がある） | JSON/XMLの明示ツリー、フラットテキスト・配置からの推定ツリー（[issue-0199](issues/issue-0199-tree-structured-source-adapters.md)） | 3 |
| 変換・表示 | ● | 変換パイプライン、強調、コード表示、キャプション | 画像参照の表示 | 2 |
| 検証 | ● | 診断コード6種、CLI `check`（JSON・終了コード） | Candidate・取り込み結果の診断 | 2 |
| provenance | ◐ | Source Identity v1、納品物一覧（Linked）、import ledger（Extractedのsource/occurrence/fingerprint/output/conversion/review basis） | 他Candidate種別と一括変換への拡張、detach監査用の横断report | 2〜4 |
| materialize | ◐ | `mmi materialize`で小表をinline GFM化、カード相当表を独立Markdown化、本文のローカル画像を`mmi-assets/`へdigest名で複製・rebase。採用済みExtracted表/画像のfreshnessも事前照合 | Tree/Shape等の採用Candidate実体化、実務E2E | 4 |
| detach check | ◐ | materialize preflightで採用済みExtracted表/画像のchanged/stale/untrackedをfailし、`mmi detach-check`で残存MMI参照、未実体化marker、旧別紙カード、壊れた/境界外リンクをfailできる | 非表Candidateへの同契約拡張、実務E2E | 4 |
| 執筆支援 | ● | 補完、貼り付け（Windowsの出所取得を含む）、説明からの検索、案内付きの作成、ホバー、表・画像Candidateの後追いレビューUI（facet絞り込み、採用/修正採用/却下/却下解除/永続保留/保留解除） | 多環境の実機確認（issue-0110）、利用者観測（issue-0111） | 継続〜2 |
| AI/CI利用 | ◐ | CLIから`inspect`/`extract`/`check`/`render`/`materialize`/`detach-check`/`handoff`/提案再検証等を利用でき、Candidate JSON、AI向け指示パック（`skills/mmi`）、基本設計書キット、執筆ベンチマーク v0がある | 配布（npm等）、より安定したagent-facing contract、将来のMCP | 1 |
| 外部LLM handoff | ◐ | local-only evidence package/promptを生成し、返却MMI記法とCandidate選択案をAuthority側でfail-closed再検証できる | 変換案の再検証、実利用E2E、agent-facing配布 | 1 |
| 軽量認知 | ◐ | Fly-inspired matcher、worksheet format、Cognitive Contract等の研究資産 | 要件ごとのM0〜M4比較、deterministic/provider-dependent実行分離、Ollama/LM Studio等の既存local runtime再利用、model/profile artifact配布（issue-0204） | 1〜3 |
| 応答性 | ● | 読込みの再利用と失効、検索索引の差分更新 | 画像を含む大きなブックでの測定 | 2 |

## 認知方式の差分

ADR-0020で、認知方式をモデル種別ではなく要件ごとに選ぶ方針を採用した。明示抽出（M0）、決定論的推定（M1）、軽量類似（M2）、bounded Judgment（M3）、local generative（M4）、external handoff（M5）を比較し、最も単純で十分な方式を優先する。

Candidate contractでは、由来の `observed/inferred/abstained`、採用・修正等のreview state、`deterministic/provider-dependent` を別軸として保持する実装まで到達した。残る主な認知差分は、provider-dependent処理を編集・CIの主経路から運用上も分離すること、model/profile artifactをCoreから分離すること、導入済みOllama/LM Studio等のruntime/model cacheを再利用することである。

## AI利用境界の差分

製品方針は、MMIと生成AIの関係を次の3つに固定した。

1. 外部LLM / AIエージェントからMMIを呼ぶ。
2. MMI内部ではFly-inspired、Jev類似技術、ローカルLLM等の軽量・ローカル認知を使う。
3. MMIが外部LLM向けの作業依頼・判断材料を生成するが、自ら送信しない。

したがって、課金型生成AI APIの組み込み、APIキー管理、自動クラウドfallbackは製品ギャップとして追わない。必要なのは外部AIから使いやすい機械可読契約と、handoff package、ローカル認知の実用性である。

## 3. 測定で分かったこと

- **執筆ベンチマーク v0（[結果](../04_Documentation/benchmarks/ai-writing/results/2026-09-30-v0.md)）:** 12行程度の表では、MMIなしでもAIは表を誤って写さなかった。差が出たのは正本の変更後で、写した表は古くなり、参照した表は追従した。Linkedの価値は単発の正確さより追従にある。ADR-0019がExtracted・Detachedへ価値を広げたことと整合する。
- **本文と表の矛盾は未検出:** 正本の変更後、参照した表は追従したが、本文の説明（「申請者は承認できない」）は古いまま残った。ADR-0019 D12のとおり業務的正しさは保証外だが、人がExcel側を直し続ける運用では、Markdown側の本文が気づかれずに古くなる危険がある。
- **執筆中の診断（2026-10-03対応）:** 入力を止めて0.4秒後に検査し、カーソルのある行の参照の診断は、別の行へ移る・保存する・開くまで控える（`markdownMatrixInjector.diagnostics.whileTyping`で`full`にできる）。CLI `check`とCIは従来どおり網羅的。純粋な方針関数の単体テストと拡張機能ホストの起動確認まで。入力中の表示を人が目視で確かめる確認と、手戻り・中断の観測（issue-0111）は未実施。
- **画像の読み取り:** SheetJSの`bookFiles`からOOXML drawing/mediaを読み、画像Candidate化と`extract`を実装した。コード生成fixtureに加え、実Excelブックで4枚のanchorがExcel自身の開始・終了セルと一致し、抽出bytesも元画像と一致することを確認済み。

## 4. 計画と運用の差分

| 差分 | 影響 | 対応 |
| --- | --- | --- |
| 研究（structured artifact SAI-0〜2B、review route）に追跡Issueがない | 製品の優先度と無関係に研究が進み、Candidateへ合流しない | issue-0193で研究成果をCandidate種別へ対応付ける |
| [現在の作業](README.md)のADR-0017の記述が「未決定」のまま | 実際はAccepted・実装済み（2026-09-25）。誤った前提で作業を選ぶ | READMEを訂正（本改訂で実施） |
| `planning_queue.py`が補足付きの状態（`In Progress（…）`）を未完了と判定しない | issue-0110・0111・0115・0190が一覧から漏れる | 状態の先頭語で判定するよう修正（本改訂で実施） |
| issue-0190の状態が独自表記（`Implementation complete; local execution pending`） | 一覧で拾えない | 規定の状態（In Progress）へ直す |
| 優先度3のTree一般化、初回一括変換、CandidateレビューUI、上位名称の検討が未追跡だった | 価値定義はあるが着手条件が曖昧になる | issue-0199〜0202へ切り出し。既存0193〜0198への依存を明記 |
| `xlsx`の依存がCDNのtarball | CLIをnpmで配布するときの障害になり得る | issue-0197で配布形態と合わせて判断 |
| プロダクト名「Markdown Matrix Injector」が現在の価値範囲より狭い | 表注入ツールと誤解され、Core / Agent / detachabilityの価値が伝わりにくい | [issue-0201](issues/issue-0201-product-name-and-compatibility-layer.md)で、MMIをNotation/compatibility layerとして残す案を含めて比較。決定前は実装名を変えない |

## 5. 既存の研究とCandidateの対応

対応表は[Semantic Candidate契約 v1](../02_Architecture/candidate-contract-v1.md)§6に確定した（2026-10-01、実コードを確認）。研究コードの移動・削除はしない。ここには、計画に影響する要点だけを残す。

| 研究の成果 | 対応するCandidate | 状態 |
| --- | --- | --- |
| 表の領域検出（製品、`regionDetector`） | Table / Range | **Candidate化済み**（`mmi inspect --json`）。座標`observed`、境界・見出し`inferred` |
| Excel貼り付けの出所照合 | Table / Rangeの確定 | `confirmed`への唯一の製品経路 |
| CPU範囲探索（FlyHash等） | Candidateの検索 | 候補順位（`scores`はprovider別） |
| worksheet format、review route | Candidateの属性（書式プロファイル、レビュー優先度） | Candidate種別ではない |
| structured artifact（SAI）の`table_like`・本文らしさの特徴 | Table / Rangeの特徴 | 合成18グループのみの結果。実データ検証が先 |
| structured artifact の`hierarchy_relation`・`repeated_block`・`ambiguous_or_non_table` | Tree / Hierarchy、Note、List、Section | **未着手**。ラベル名の宣言があるだけで、出力を生成するコードは`src`にも`test`にも無い（旧版はこの3つを研究済みと誤記していた） |
