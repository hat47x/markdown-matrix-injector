# ADR-0012: ミッション再定義 — 「正本参照規約」としての MMI (Notation as Governance Boundary)

- Status: Accepted
- Date: 2026-07-08
- Deciders: Human Sponsor（方向性承認済み）+ MMI Lead Agent
- Consulted: 拡張ステークホルダーパネル（既定3ロール + 外部7視点、議事録参照）
- Informed: Documentation / Implementation maintainers
- Scope: プロダクトの使命・価値主張の再定義、記法の仕様正本化（conformance levels）、編集機能の恒久非対象化、KPI再定義

## Context (背景と課題)

### 環境変化
AIコーディングエージェント（Claude Code等）がExcelファイルを直接読み書きできるようになりつつあり、
「人間がExcelからデータを取り出して見るためのビューア」としてのMMIの価値は逓減が予想される（Human Sponsor提起）。
プロダクトを公開する社会的意義の再考が必要になった。

### 価値の再検証（何が陳腐化し、何が増価するか）
| 価値要素 | agentic 時代の帰趨 | 理由 |
|---|---|---|
| 人間向け抽出・転記ビューア | 陳腐化 | agent が代替 |
| 二重管理（コピペ表）の排除 | **増価** | 編集コスト低下はドリフトを高速・大量化させる。発生源が人間から agent に変わるだけで問題は悪化 |
| read-only 参照チャネル | **増価** | 「何でも編集できる agent」の世界で、構造的に書き込めない参照経路は安全装置になる |
| クエリによるスライス参照 | **増価** | 巨大 xlsx はコンテキストウィンドウに入らない。宣言的断面参照は agent のコンテキスト経済そのもの |
| diff・レビュー・監査 | 残存 | agent が xlsx を編集できても、人間のガバナンス層にとってバイナリが不透明である事実は不変 |
| 納品 PDF 品質 | 残存 | AI の編集能力と無関係の要件 |

### 帰結
MMIの恒久的な社会的意義は「Excelを読み書きする手段」ではなく、
「正本（構造化データ）とテキスト文書（人間+agent）の間のガバナンス境界」にある。
ツール（VS Code拡張）は世代交代し得るが、記法（規約）とその保証性質は長く残り得る（Markdown / CommonMark / Mermaidの先例）。

## Decision (決定事項)

### D1. 使命の再定義
MMIの使命を次のとおり再定義する（requirements.md §0へ反映、issue-0101）。

> テキスト文書から正本表データの必要断面を宣言的・読み取り専用・検証可能に参照するための
> 公開規約（MMI Notation）とその参照実装を提供し、人間と AI エージェントが共存する文書運用において
> 「コピーによる二重管理」を「参照による単一正本」へ置き換える。

VS Code拡張は「プロダクト本体」から「参照実装 (reference implementation) の一つ」へ位置付けを変更する。

### D2. 記法の仕様正本化 — MMI Notation v1（仮称）
`![[<target>#<sheet>|<range>?<params>]]` を一級の成果物（公開仕様書）として独立させる。
広い受容のため、仕様は以下の conformance levels で段階実装可能とする（部分実装でも準拠を名乗れることが普及の鍵）:

| Level | 名称 | 実装範囲 | 想定実装者 |
|---|---|---|---|
| **L0** | Parse & Passthrough | 記法の認識と**可視な劣化表示**のみ（データアクセスなし） | linter / formatter / 変換ツール |
| **L1** | Static Slice | CSV/TSV + range + `header`/`columns`/`grep` | 静的サイトジェネレータ、CI レンダラ、mdBook/Pandoc フィルタ |
| **L2** | Workbook & Query | XLSX/XML シート + 全クエリパラメータ + Smart Fallback **判定** | エディタプラグイン（Obsidian 等）、プレビュー実装 |
| **L3** | Publication Profiles | 印刷制御（caption/id/pageBreak/orientation）+ カード UI + 別紙マニフェスト = **Delivery Profile** | 納品文書パイプライン（現 VS Code 拡張 = L3 準拠の参照実装） |

### D3. コア規範原則（広い受容のための深化）
仕様v1のコアに以下を規範（RFC 2119語彙）として置く:

1. **Read-only MUST**: 準拠プロセッサは参照先を改変してはならない。編集機能は本規約の恒久的な非対象（moat）。
2. **Visible degradation MUST**: 未対応ホストでは原文記法がそのまま見えること（サイレント消失禁止）。リンク切れ・非対応が「隠れて壊れる」ことを規約レベルで禁止する。
3. **Determinism MUST**: 同一の正本 + 同一のクエリ → 同一の論理表。監査・エビデンス（query-evidence）・agent検証ループの基盤。
4. **Containment MUST**: パス解決はワークスペース境界内に限定。コア仕様にネットワーク取得を含めない（リモートソースは明示opt-inの拡張とする）。企業のセキュリティ統制が承認可能な挙動境界を仕様が保証する。
5. **Forward compatibility**: 未知のクエリキーはエラーにせず無視する（MUST）。実験は `x-` 名前空間。仕様はSemVerで版管理し、v1コア構文は凍結。
6. **Stable diagnostics**: `MMI_FILE_NOT_FOUND` / `MMI_SHEET_NOT_FOUND` / `MMI_INVALID_XML` 等の診断コードを仕様の一部（安定API）とし、機械的に処理可能にする。
7. **i18n中立**: クエリキーはASCII、値は任意のUnicode。日本語圏固有の納品概念（別紙・改ページ・向き）はコアから分離し Delivery Profile (L3) に隔離。仕様書は日英併記。
8. **Machine-readable contract**: パラメータのJSON Schemaとconformance test corpusを仕様と同時に公開。corpusは (a) 他実装の準拠試験、(b) AIエージェントへの教示（1ファイルで記法を学習可能）、(c) 参照実装の回帰資産（Phase 9資産の継承）を兼ねる。

### D4. エコシステム互換の明文化
- `![[...]]` はObsidianの埋め込み記法の上位互換系であることを仕様に明記する（Obsidian上では「エイリアス付き埋め込み」として概ね無害に劣化）。既存の記法習熟人口が最大の普及レバー。
- 既知の構文摩擦（Markdownテーブル内の `|` 衝突、CommonMarkでの分解のされ方）は仕様の「Degradation classes」節で正直に規定する（issue-0102の仕様起草スコープ）。

### D5. agent-first の位置付け
価値主張の第一声を「agentic documentationのガードレール」とする。
- agentには表をコピーさせず参照を挿入させる（Diagnosticsが機械検証可能な契約）。
- query-evidenceを「agentが書いた文書と正本の一致検証」のground truthとして位置付ける。
- 本リポジトリのAGENTS.md駆動構造自体を「agentと協働する文書リポジトリ」の実例として提示する。

### D6. KPI の再定義
採用観測（Phase 10基盤を流用）の主要指標を「閲覧・導入時間」から
「駆逐されたコピー重複」「正本と文書の乖離インシデント」「表変更のレビュー所要時間」へ差し替える。
これらはagentic時代でも意味を失わない。

### D7. ヘッジ
さらに先の「文書自体が正本から都度AI生成される」世界でも残る資産は
①構造化された正本、②参照規約、③表パターン資産（Phase 9）の3つ。
今後の投資は拡張機能UIの磨き込みより、仕様の一般化と資産の独立公開に比重を置く。

## Consequences (結果と影響)

- **Good:** プロダクトの意義が特定エディタ・特定 AI ツールの世代交代から独立する。部分実装を許す conformance levels により他ツール実装者の参入障壁が下がる。
- **Good:** read-only・containment・determinism を仕様が保証するため、企業統制・監査・規制産業が「承認できる」根拠を持つ。
- **Good:** 既存実装（VS Code 拡張、176 tests、G1–G4 証跡）はそのまま「L3 準拠の参照実装」として再利用され、無駄にならない。
- **Bad:** 仕様書・JSON Schema・conformance corpus の起草という新たな文書工数が発生する。
- **Bad:** 「規約」を名乗る以上、v1 凍結後の構文変更コストは大きくなる（意図的な制約）。
- **Trade-off 受容理由:** ツール単体の価値逓減（Human Sponsor の提起）に対し、規約化は唯一の恒久価値化経路であり、実装資産を毀損しない。

## Follow-up Actions
- issue-0101: 上流再配置（requirements §0 / Phase 12定義、README・overviewの価値記述の書き換え）
- issue-0102: MMI Notation v1仕様書の起草（conformance levels、degradation classes、JSON Schema、conformance corpus骨格）
- 継続: issue-0100（カード開くボタン、ADR-0011）はL3参照実装の品質項目として位置付け不変

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` §0（issue-0101で改訂）
- Related ADR: ADR-0010（完成度ゲート — 参照実装の品質基準として継続）/ ADR-0011（カード開く操作）
- Related issues: issue-0101, issue-0102, issue-0100
- 資産: `04_Documentation/samples/phase9-rule-table-benchmark-pack.csv`（正本CSV）+
  `04_Documentation/samples/phase9-rule-table-pattern-guide.md`（独立公開ガイド、生成物。実装は
  `ADR-0013`/`issue-0104`）

## 議事録 (AI読込不要)

### Issue Definition
AIがExcelを直接編集できる時代に、本プロダクトを公開する社会的意義をどこに置き、規約をどう深化させれば最も広く受け入れられるか。

### 拡張パネル構成
既定3ロール（Architecture Lead / Product・UX Lead / QA・Delivery Lead）に加え、外部7視点を招集:
SIer執筆者、レビュア・監査担当、企業ITセキュリティ統制、他ツール実装者（Obsidian/Pandoc/mdBook）、AIエージェント開発者、国際コミュニティ（非日本語圏）、データエンジニア。

### Round 1 — 各ステークホルダーの要求抽出
- **SIer執筆者**: 「5分で覚えられる最小コアでなければ現場は使わない。未対応環境で文書が黙って壊れるのが最怖」→ 最小コア + Visible degradation MUST。
- **レビュア・監査担当**: 「あるコミット時点で文書と正本の一致を証明できることが全て。再現不能な描画は監査に使えない」→ Determinism MUST + query-evidenceの規範化 + 正本の版固定（git SHA）ガイダンス。
- **セキュリティ統制**: 「承認可否は挙動の上限が仕様で保証されるかで決まる。書き込みなし・ワークスペース外アクセスなし・ネットワークなしを仕様が言い切るなら通せる」→ Read-only / Containment MUST、リモートはopt-in拡張へ隔離。
- **他ツール実装者**: 「フル実装を要求する仕様は移植されない。CSV+rangeだけでも準拠を名乗れる段階制と、仕様書より効くconformance corpusが欲しい」→ L0–L3 levels + corpus同時公開。
- **AIエージェント開発者**: 「agentに教えるのは散文でなくスキーマとテストケース。診断コードが安定APIなら自動修復ループが組める」→ JSON Schema + corpus + Stable diagnostics。
- **国際コミュニティ**: 「別紙・納品・改ページは日本のエンタープライズ文脈。コアに混ぜると『日本ローカル仕様』と見なされ広がらない」→ Delivery Profile (L3) への隔離、日英併記。
- **データエンジニア**: 「明日はparquetやDBビューを参照したくなる。ただしコアを太らせるな」→ 抽象source providerを拡張点として定義、コアはファイルベース表形式に限定。

### Round 2 — 対立点と解消
- 「Obsidian互換を謳うと将来の構文自由度を失う」（Architecture）vs「既存習熟人口が最大の普及レバー」（Product）→ 上位互換系と劣化挙動の明文化で両立（互換の保証ではなく劣化クラスの規定）。
- 「編集機能があればround-tripできて便利」（データエンジニア）vs「書けない事が承認根拠」（セキュリティ統制）・「書けない事がmoat」（Product）→ Read-onlyを恒久規範（D3-1）として凍結。round-tripは正本側ツールの責務と切り分け。
- 「KPI差し替えで既存Phase 10資産が無駄になるのでは」（QA）→ 収集基盤は流用可能、指標定義のみ差し替え（D6）。

### Round 3 — Synthesis & Decision
- 全会一致: 意義の恒久化経路は「規約化 + ガバナンス境界」のみ。conformance levels・8規範原則・profile分離・machine-readable contractをv1の骨格として採択。
- エスカレーション判定: requirements §0の使命変更はコア思想の変更に該当するが、本方向性はHuman Sponsor自身の提起・承認に基づくため追加承認不要。反映はissue-0101で実行。
