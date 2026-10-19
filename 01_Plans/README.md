# 現在の作業

この文書はMMIの開発状況と、次に進める作業の一覧です。MMIを初めて知る方は、先に[概要](../04_Documentation/overview.md)をご覧ください。

現在の基本方針は、**慣れたExcelを使い続けながら、必要な情報を文書から参照できるようにすること**です。すべてをMarkdownへ移したり、原本を廃止したりする必要はありません。取り込みや切り離しは、扱う情報ごとに人が選びます。

以下の「実装済み」はコードや自動テストで確認できたことを示し、**実際の書き手が問題なく使えたことまで保証しません**。「実機確認が残る」「利用者による確認が残る」と記した作業は、完了とは区別してください。技術的な状態と根拠は、後続の一覧にそのまま残しています。

## 現況

**製品方針:** [ADR-0019](adr/ADR-0019-ai-era-sier-document-value-and-policy.md)（2026-10-01採択、2026-10-08改訂）により、既存Excel設計書の書式・運用を踏襲してMarkdown文書と共存させるユースケースを最優先とする。新しい表も人がExcelで作成・保存し、VS Codeで参照・確認・修正しながら本文を書けるようにする。Excel方眼紙をレガシーとみなす見方と既存のスタイルの両方を尊重し、図形やレイアウトに意味がある範囲は画像として取り込んでよい（D0）。Linked・Extracted・Detachedは情報単位ごとに選ぶ状態で、共存する文書をDetachedへ進める必要はない。人の作業を止めないことを移行の速さより優先する（D13）。共通Core、MMI記法、Read-only、決定論的なAuthority Planeを中核とし、認知機能は執筆の具体的な不足を補う非権威的な支援として選ぶ。

**実装の到達点:** Linkedは表で実装済み。Extractedは表・Excel埋込画像に加え、JSON / 安全subset YAMLのobject / arrayと汎用XMLのelement、フラットテキスト、Excel / CSVの親列・Level列から得たTree Candidateを選択的に取り込める。AutoShapeとコネクタはDrawingMLから`shape` Candidateとして観測し、`inspect`・AI handoff・VS Codeレビュー・一括取り込みの下書きへ接続済みである。two-cell anchorで範囲を安全に確定できるShapeは、レビュー画面から既存の`region-snapshot`生成へ渡せる。Shape自体はまだExtracted資産へ変換しない。graphic frameはグラフや図を含み得るため種類を断定せず警告に残す。表・画像・Treeは共通Candidate/ledgerを使い、`inspect`で列挙し、`extract`で標準Markdownまたは画像assetへ取り込む。VS CodeのレビューUIも同じ採否・保留経路を使い、表形式階層は利用者がシートと列を明示してから同じレビュー画面へ渡す。Treeは構造位置とsubtree fingerprintを分けて記録し、採用後に対象subtreeが変わっていないかdetach前に再確認する。汎用XMLはnamespaceを検証し、DTD依存の解釈と非UTF-8入力をfail closedにする。既存ブックの初回取り込みでは、VS CodeとCLI `mmi import`が同じ処理を使い、表はLinked参照のまま、.xlsx/.xlsmの埋込画像はExtracted assetとして1回で下書き化する。Detachedも最小縦切りが入り、`materialize`でMMI参照を標準Markdownへ実体化し、`detach-check`で残存参照・未実体化marker・壊れた/境界外リンクを検査できる。Shape等へのExtracted一般化と実務E2Eは未完。CLIは`schema candidate`・`inspect`・`extract`・`import`・`check`・`render`・`materialize`・`detach-check`・`manifest`・AI handoff/再検証を提供する。`inspect --json`はCandidate配列とともに`mmi.semantic-candidate/v1`を明示し、外部AIや連携基盤がTypeScript実装を読まず契約を取得できる。AI向け指示パック（`skills/mmi`）、基本設計書キット、執筆ベンチマーク v0もある。記法仕様はDraft、配布物は公開準備中の検証版。差分の詳細は[ギャップ分析](product-gap-analysis.md)を参照する。

## 優先度と作業

利用者向けの最優先は、D0・D13と要求EW01〜EW07に基づく併用執筆の受入と不足の修正である。既存の技術基盤の優先度番号は維持し、それぞれをこの作業へつなぐ。

| 優先度 | 作業 | 状態 | 次の一手 |
| --- | --- | --- | --- |
| **利用者向け最優先（D0・D13）** | [既存・新規のExcel表とMarkdownの併用執筆](https://github.com/hat47x/markdown-matrix-injector/issues/514)（[見直し](vscode-excel-authoring-review.md)・[利用案内](../04_Documentation/excel-markdown-authoring.md)） | **In Progress**（保存後のsource-aware再確認、原本影響確認、A1明示範囲入力を実装。表候補0件のシートからも同じ範囲指定へ復帰可能。実機確認は未完） | 保存後の値変更、新規表の明示範囲指定、シート名変更を実VS Code＋Excelで確認し、その後、構造変更、取消・Undo、取得不能まで六場面を一巡する |
| **1 Coreと入口** | [Candidate・Source Adapter・provenanceの契約](issues/issue-0193-candidate-source-adapter-contract.md) | **Done**（契約 v1。表・画像・Choice list・AutoShape/connector・JSON/YAML/XML/推定Tree Candidateが利用。`mmi schema candidate`で機械可読契約を取得可能） | 次の一般化はNote / Section / graphic frame等、source semanticsを安全に読める対象へ |
| 1 | CLI（inspect/check/render/manifest）、AI向け指示パック、基本設計書キット、[執筆ベンチマーク](../04_Documentation/benchmarks/ai-writing/README.md) | 実装済み | ベンチマーク v0は実施済み。表を大きくした v1は優先度5 |
| 1 | [外部LLMへの作業提案と判断材料](https://github.com/hat47x/markdown-matrix-injector/issues/493) | **In Progress**（local-only handoff、MMI記法・Candidate選択・変換案のfail-closed再検証を実装。変換案は共通Candidate目録で再発見し、表・画像・JSON/YAML/XML/フラットテキストTreeの既存変換へ束縛） | 次: manual-e2eでhandoff → 外部提案 → 3種類の再検証が自動適用なしで完結することを確認 |
| 1 | [CLIの配布](https://github.com/hat47x/markdown-matrix-injector/issues/500) | **In Progress**（lockfile固定・最小runtime閉包・依存同梱npm tarball、生成時offline smokeを実装） | Windows（Node 24）での導入・`check`・`render`と、Node 18のversion errorは確認済み（2026-10-15）。次: 開発環境の無い別マシンとNode 20で同じmanual-e2eを繰り返し、macOSも確認する |
| 1 | [portable coreと最小バイナリ](https://github.com/hat47x/markdown-matrix-injector/issues/506) | **In Progress**（JSON contract、TS参照実装、標準Go CSV/JSON Tree、XLSX decoder gate。CLI/VS Codeの主要Candidate生成を共通Application snapshotへ収束しhost parityを回帰化） | 次: 通常Go環境でnative/WASM suiteを再実行し、共通Application境界をportable conformance corpusへ段階的に広げる |
| 1〜3（横断） | [認知model/profile資産の配布](https://github.com/hat47x/markdown-matrix-injector/issues/507) | **In Progress**（Manifest v0、content-addressed cache、local/HTTPS/runtime-managed resolver、明示download、Ollama digest pin、共通artifact評価metricsとCPU semantic評価接続を実装） | 次: 公開artifact / 実Ollama modelでdigest-bound reportを生成し、cold・cache hit・offline・digest driftを実測する |
| **2 モダナイズの最小縦切り** | [Excel画像の候補化と取り込み](issues/issue-0194-excel-image-candidates.md) | **Done**（`inspect`の画像一覧、`mmi extract`、実Excel検証、issue-0195による変更検知） | 次: VS Code上の採否UI（issue-0202）、他Candidate種別への展開 |
| 2 | [取り込み台帳と未取込の表示](issues/issue-0195-import-ledger.md) | **Done**（`mmi.ledger/v1`、未取込/変更/stale、lineage、研究similarity Evidence） | 次: issue-0200のbaseline converter、issue-0202のレビューUIが同じ台帳契約を利用 |
| 2 | [初回一括変換とCandidate基盤の接続](https://github.com/hat47x/markdown-matrix-injector/issues/503) | **In Progress**（表Linked＋画像Extractedの組み込み一括取り込みをVS Code/CLIへ接続。MarkItDown評価経路も整備） | 実在設計書で組み込み経路を観測し、外部Converterは比較候補としてデスクトップ実測で判断 |
| 2 | [シート・範囲の画像化](https://github.com/hat47x/markdown-matrix-injector/issues/501) | **In Progress**（AutoShape・コネクタはOOXMLから個別Candidate化し、two-cell anchorはinspectのsnapshot hintとCandidateレビューから既存region-snapshot生成へ接続。graphic frameは未解釈warningとして保持） | 次: MMI自身の描画とLibreOfficeを同じfixtureで比較し、CIで再現できるsnapshot方式を選ぶ |
| 2 | [人の作業を止めないCandidateレビューUI](https://github.com/hat47x/markdown-matrix-injector/issues/505) | **In Progress**（表・画像・Choice list・AutoShape/コネクタ・JSON/YAML/XML/フラットテキストTreeに加え、列を明示したExcel/CSV階層Treeも同じreviewへ接続。import/review facet、採否・保留、表/画像の修正採用を実装。provider-dependent用の非同期host laneも追加し、現在セッションを待たせず次回レビューへcache反映する境界を固定） | 最初の実M2/M3 Candidate producer接続、Windows実機E2E、利用者観測 |
| 2 | [既存設計書の取り込み候補](https://github.com/hat47x/markdown-matrix-injector/issues/508)（方眼紙の表の参照提案・役割候補・下書き） | **In Progress**（VS Code/CLIへ接続、架空データで評価済み） | 残: 画面操作の目視確認、実在設計書で候補の採用・修正・却下を観測 |
| 2 | [Excelを開かずに表・列・行を選ぶ入口](https://github.com/hat47x/markdown-matrix-injector/issues/509)（名前・テーブル・非表示、見出しによる選択） | In Progress（試作） | 残: 目視確認。[ADR-0022](adr/ADR-0022-semantic-selection-in-notation.md)は2026-10-06に採択（選択肢Bの`x-headers`・`x-table`・`x-name`を参照実装の実験キーとして採用。C `where=`は、`grep`の曖昧さの実測が弱い（24件中2件）ため、再判断の基準つきで保留）（select/findのCandidate指紋対応は実施済み） |
| 2（既存） | [Excel範囲貼り付け](https://github.com/hat47x/markdown-matrix-injector/issues/495) | Open | Paste As宿主dispatchの自動E2Eは実VS Code 1.140.0で3回連続成功（2026-10-06）。残: Windows実ExcelのHTML/helper/視覚picker実機証拠。表Candidateの `observed` / `inferred` を保ったまま、採用時にreviewを `accepted` とする経路として扱う |
| 2（既存） | [CPUでの範囲探索](https://github.com/hat47x/markdown-matrix-injector/issues/496) | In Progress | 言い換え対応。v4初回評価（2026-10-06）でRecall@5 0.633・言い換え1/8・誤受理0。辞書では扱えず、構造による言い換えレーンも未見v5で0/22（安全性は維持）。**ローカル埋め込みによる意味検索を実験的・既定オフで実装済み**（loopback限定、設計§7.4b）。未見v6（事前登録の閾値0.6）で言い換え 0→8/30（Recall@5 0.304→0.500、モデルによる誤受理0）。実用水準には届かず既定オフのまま |
| 2（既存） | [文脈に応じた補完](https://github.com/hat47x/markdown-matrix-injector/issues/491)、[参照の作成・編集](https://github.com/hat47x/markdown-matrix-injector/issues/492) | In Progress | 多環境の実機確認、利用者の観測 |
| **3 Source Adapterの一般化** | [Tree / Hierarchy、JSON/YAML/XML、フラットテキスト](https://github.com/hat47x/markdown-matrix-injector/issues/502) | **In Progress**（Tree各形式を共通ライフサイクルへ接続。Excel Choice listは別kindのまま直接範囲参照をM0解決。AutoShape/connectorもsource semanticsからM0 Candidate化） | 次: structured artifactの`hierarchy_relation`をAuthorityへ昇格させないPerception providerとして接続する |
| 3 | Shape、その他List source | **In Progress** | AutoShape/connectorのSource Adapterとreview/import観測は実装済み。Choice listは独立kindを継続。残る主課題はShapeのExtracted変換とgraphic frame等の安全な分類 |
| 3（研究） | structured artifact（SAI）、worksheet format、[review route](https://github.com/hat47x/markdown-matrix-injector/issues/497) | In Progress | 新しい研究段階は、issue-0193の対応表のどの行を強くするかを示してから始める |
| **4 Detachability** | [実体化とdetach check](https://github.com/hat47x/markdown-matrix-injector/issues/499) | **In Progress**（表・別紙・ローカル画像のmaterialize、採用済み表・画像・JSON/YAML/XML/フラットテキスト/表形式階層Treeのfreshness preflight、artifact closureを実装） | 表・キット・画像つき文書の手動E2Eを確認済み（2026-10-08）。Windowsでキットの実体化とdetach-checkも確認済み（2026-10-15）。残: 実在する設計書での確認、macOS、Windowsの画像つき文書。Shape等がExtracted可能になったら同じprovenance/freshness契約へ拡張 |
| 4 | [原本参照の影響分析](https://github.com/hat47x/markdown-matrix-injector/issues/515) | **In Progress**（Linked / Extracted / ローカルリンクをread-onlyで横断列挙。CLIに加え、エクスプローラーから影響先Markdownの該当行を開ける） | Node 20と実VS Codeで確認し、実務workspaceの変更・移動・削除判断に十分かを観測する |
| **5 組織導入** | 文書キットの追加、CI関門、執筆ベンチマーク v1（大きな表・複数シート・本文と表の矛盾） | 未起票 | 優先度2の縦切りの後 |
| 5 | [外部の判断記録からの根拠の固定（SEI）](https://github.com/hat47x/markdown-matrix-injector/issues/498) | Draft | CLIの契約が固まった後 |
| 横断・実行確認 | [リファクタ後の製品テスト9件の再確認](issues/issue-0212-refactor-test-drift.md) | **Done**（2026-10-13、Node 20で9件が合格。全体testの失敗は研究層の36件のみ） | 研究層の既知失敗は個別Issueで扱う。標準出力を差し替えて取り込むCLIテスト11ファイルの点検（任意） |
| 横断（公開の前提） | [上位プロダクト名とMMI互換層の整理](https://github.com/hat47x/markdown-matrix-injector/issues/504)、[製品の磨き直し](product-repolish-plan.md)（命名・価値の言い方・約束ごとの不足と順序） | **Proposed**（[ADR-0024](adr/ADR-0024-product-name-layers-and-value-statement.md)。総称を新しく立て、MMIを記法・契約・CLIの名として残す。第一候補はTsugite（継手）） | 商標調査と読み手の確認を経て、Human Sponsorが総称を決める。拡張ID・npm名などの識別子は初回公開（#500）の前に移す（#517）。決定前はrepo/package/CLI名を変更しない。約束ごとの不足は#517〜#532（Draft）に起票した |
| 横断（公開の前提） | リリース候補と検証版の配布（[ADR-0025](adr/ADR-0025-release-candidate-evidence-and-channels.md)） | **In Progress**（0.2.0。`npm run release:candidate`で、版の整合・全体の型検査・製品テスト・VSIXの監査・CLIのoffline導入確認を一つのコミットに結び付けて記録。CIは変数`MMI_ACTIONS_ENABLED`で再開できる） | 証拠付きの0.2.0検証版をHuman Sponsorが配り、ADR-0010 G1〜G4の実機確認をこの版で記録する。公開版は#504・#517の後 |
| 2（既存） | [表の検索で見つからなかった依頼の観測](https://github.com/hat47x/markdown-matrix-injector/issues/510)（略語・表記・言い換えの需要を、同意のもとローカルに数える。[設計](../02_Architecture/search-observation.md)） | **In Progress**（既定オフ、privacy-safe record、1,000件循環、件数集計、検索セッション接続を実装） | 次: 拡張機能ホストE2Eで選択・入力修正・キャンセル・alias結果を確認し、観測オン/オフで候補順位が不変であることを固定 |
| 3（認知候補） | [ローカル認知runtime評価](https://github.com/hat47x/markdown-matrix-injector/issues/494) | Draft | M0〜M2で不足する具体的taskが定まったら、Ollama / LM Studio等の導入済みruntimeを含め比較評価 |
| 横断（認知・採用保留） | [条件付き比較と次の一問](https://github.com/hat47x/markdown-matrix-injector/issues/512) | Draft / Low（意味対応・条件入力の準備を上回る執筆上の効果は未確認） | 通常レビューで不足する具体例と修正成果を示す。専用CLI作業票を先行しない |
| 横断（認知・採用保留） | [条件節を伴う参照下書き](https://github.com/hat47x/markdown-matrix-injector/issues/513) | Draft（通常の参照＋Markdown追記との比較が先） | 既存のVS Code参照経路へ任意の引用支援を加える価値があるかを確認する |
| 横断（探索） | [文化的体系を併用した認知機能の探索](https://github.com/hat47x/markdown-matrix-injector/issues/511) | In Progress（[採用判断](cognitive-cultural-adoption-plan.md)を執筆の観点で見直した） | N01・N02を原本確認と執筆再開の仕事へ戻し、通常の参照・追記で足りない要素を深める |

**優先度の根拠:** 執筆ベンチマーク v0では、小さな表をAIが誤って写すことはなく、MMIの差は正本の変更への追従に出た（[結果](../04_Documentation/benchmarks/ai-writing/results/2026-09-30-v0.md)）。人がExcelで書き続けても追従する（Linked）ことは、それだけで価値がある。そのうえで、人がExcel等に置いた表・画像を選択的に標準資産へ移し、同じledgerとレビュー経路で追跡できるExtractedの経路が次に価値が大きい。Detachedは、原本を廃止すると決めた範囲のための経路として優先度4に置き、最小materialize/check縦切りまで実装した。その入口がCandidateの契約（issue-0193）で、研究の成果を製品へ合流させる唯一の経路でもあるため、最上位に置く。

**AI境界:** MMI自身は原則として課金型生成AIサービスを呼ばない。外部LLMはMMIを利用する側に置き、MMI内部の認知はFly-inspired、Jev類似技術、ローカルLLM等の軽量・ローカル方式を候補とする。外部LLMの判断が有用な場合は、MMIがprompt / evidence packageをローカル生成し、送信は利用者側へ委ねる（ADR-0018 D8・D11、ADR-0019 D15）。

**認知方式:** [ADR-0020](adr/ADR-0020-requirement-oriented-cognition-method-selection.md)により、認知はLLM等に限定せず、M0明示抽出 → M1決定論的推定 → M2軽量類似 → M3 bounded Judgment → M4 local generative → M5 external handoffを要件ごとに比較する。最も単純で十分な方式を優先し、`observed/inferred/abstained`、`accepted/rejected`等のreview、`deterministic/provider-dependent`を別軸として扱う。採用済みの推定も`inferred`のまま保持する。provider-dependent処理は編集・CIの主経路から外す。

**表の探索の次の一手（[ADR-0023](adr/ADR-0023-fuzzy-search-before-paraphrase-and-model-runtime.md)・提案）:** 言い換え検索のためにモデル実行環境を導入させない。需要がありそうな略語・表記ゆれを、決定論のまま先に強め、未見の略語セットA1で測る。

## 確定した事実

- **原本座標:** Excel読込みは原本座標を保持するソースモデル（`SheetSource`）で、使用範囲の原点と空行を失わない。
- **クリップボード:** VS Codeの`DataTransfer`はExcelの出所形式を公開しない。Windowsの補助プロセスで出所を取得する[ADR-0017](adr/ADR-0017-windows-clipboard-provenance-bridge.md)の選択肢2を採用し、設定付き・既定オンで実装・実機検証済み（2026-09-25）。
- **画像:** SheetJS（コミュニティ版）の`bookFiles`からOOXML drawing/mediaを読み、画像Candidate化・抽出を実装済み。実Excelブックでanchorと抽出bytesを照合済み。

## 開発環境

WSL2 Ubuntu（Node v20、npm 10、Python 3.12）で`npm ci`・`npm run build`・`npm test`を実行する。VS Code実機の操作はWindows側で行う。2026-10-17の時点で、このWindows機のGit BashではNode v24.19.0とPython 3.12.10が使え、ビルド済みのCLI（`node 03_Implement/dist/src/cli/bootstrap.js`）も動いた。ただしWSLで入れた`node_modules`は、`tsc`や`esbuild`などの実行ファイルがLinux向けのため、Windowsから動かない場合がある。その場合は`node_modules`をWindows側で入れ直す。`npm test`は製品のテストだけを実行し、研究層は`npm run test:research`で別に実行する（#519）。2026-10-20以降、`npm run build`（全体の型検査）と`npm test`はWindows（Node v24.21.0）でも成功する。研究層には実装の変更と無関係な既知の失敗が残る（2026-10-13にNode 20で36件）。

## 計画の管理

依頼に該当する[GitHub Issue](https://github.com/hat47x/markdown-matrix-injector/issues)を読み、受入条件と次の作業を確認する。一覧が必要な場合はリポジトリルートで実行する。`--github`は`gh` CLIで未クローズのIssueを並べる。

```sh
python 01_Plans/tools/planning_queue.py --github
```

Draftは検討中であり、採用・実装済みを意味しない。重要な選択は[ADR](adr/TEMPLATE.md)、実行内容は[GitHub Issues](https://github.com/hat47x/markdown-matrix-injector/issues)へ記す。入力支援の経緯は[企画](input-assistance-proposal.md)・[設計レビュー](input-assistance-design-review.md)・[技術調査](input-assistance-technical-research.md)にある。日々の経緯や完了作業の一覧はこのページへ追加しない。`01_Plans/issues/`には、GitHub Issueへ移管する前にクローズしたIssueの本文だけを保管する。
