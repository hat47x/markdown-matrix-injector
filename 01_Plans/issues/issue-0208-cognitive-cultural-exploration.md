# Issue: 文化的体系を併用して認知機能の発想を広げ、取り込み候補を選べるようにする

## Meta

- Type: Docs / Research
- Status: In Progress
- Date: 2026-10-08
- Priority: Medium
- Scope: 体系に基づく深掘り、有用な要素の選択・起票、後続の読解経路と判断継承の具体化。実装は切り出したIssueで追う
- Expected verification level: docs-check

## Traceability

- Related ADR/Spec: [製品要求](../../00_Prompt/requirements.md)、[ADR-0019](../adr/ADR-0019-ai-era-sier-document-value-and-policy.md)、[ADR-0020](../adr/ADR-0020-requirement-oriented-cognition-method-selection.md)、[ADR-0021](../adr/ADR-0021-candidate-cognition-lifecycle-reproducibility.md)
- Related Design: [発想地図](../cognitive-cultural-opportunity-map.md)、[四方向の設計](../cognitive-cultural-deepening.md)、[採用要素と起票順](../cognitive-cultural-adoption-plan.md)、[適用範囲・文脈・判断経路の深掘り](../cognitive-cultural-boundary-analysis.md)、[併用執筆からの見直し](../vscode-excel-authoring-review.md)
- Related Issues: [Candidate契約](issue-0193-candidate-source-adapter-contract.md)、[Candidateレビュー](issue-0202-candidate-review-ui.md)、[認知資産](issue-0204-cognitive-artifact-distribution.md)、[外部AI handoff](issue-0112-ai-proposal-handoff.md)、[条件付き比較](issue-0209-condition-bound-comparison-draft.md)、[条件節を伴う下書き](issue-0210-explicit-context-draft.md)

## 対象

候補検出と検索に加え、問い、注意、視点、関係、構成、時間、判断の継承へ発想を広げる。文化体系固有の操作とMMI側の設計上の類推を分け、対象の資料へ戻せる形にする。

発散文書には24視点による96案と12交差案を残した。深掘り文書では8仮説を、文脈付き取り込み、条件付き比較、次の問い、判断の継承の四方向へつないだ。基本設計書キットの本文と、区別して追加した作例から、条件差・記載不足・同じ条件での相違を具体化した。これらは製品への採用や利用効果の検証を意味しない。

現在の採用判断は、既存設計書を踏襲し、新しいExcel表も使ってVS Codeで書き続ける仕事を最優先とする。要求EW01〜EW07と[issue-0211](issue-0211-vscode-excel-coauthoring-flow.md)を追加した。issue-0209・0210は、専用入力の準備を上回る執筆上の効果が未確認のためDraftへ戻した。適用範囲の重なり、優先関係未確認、引用の用途差、判断前の保留の分析は残し、原本確認・執筆再開で通常の参照やMarkdown追記では足りない場面へ深掘りを戻す。

## Acceptance criteria

- [x] 候補検出以外の認知の働きを含む発想地図があり、案に追跡可能なIDがある。
- [x] 体系由来の構造とMMI側の設計案を区別し、参照資料と確認範囲を記す。
- [x] 複数体系の交差案と、同じ材料で問い・後続成果物が変わる説明例がある。
- [x] 現行Candidate・ledger・review等への接続候補と、未実装部分を区別する。
- [x] 通常分析・体系単独・体系交差を必要な範囲で比較する方法を示す。
- [x] 有望な方向を深掘りし、具体的な仕事・比較例・試作の入出力・反例を示す。
- [x] 計画へ移す要素の根拠と未確認事項を分け、対象・受入条件・検証・次の一手を持つIssueへ切り出す。
- [x] 追加の体系操作によって比較の反例と判断経路を具体化し、起票した計画の入出力・受入条件へ反映する。
- [x] 既存設計書との共存と新規Excel表を使う執筆から採用順を見直し、要求・ADR・Issueの優先度へ反映する。
- [ ] N01の原本確認とN02の執筆再開を、通常の参照・Markdown追記で足りない具体例へ絞り、有用な範囲から次の計画へ移す。

## Validation plan

文書内の案IDの一意性、96案・12交差案・24視点・8仮説・深掘り4方向の件数、内部リンク・anchor、参照リンク定義、計画入口との接続、既存要求との整合を確認する。日本語の静的検査と目視推敲を行う。条件を切り替える説明例は、承認／差戻しと相違の有無による4状態、状態保存・復元、狭幅表示を確認する。

計画を切り出した文書では、Issue ID・状態・関連ADR・受入条件・検証範囲・起票順の整合を確認する。追加分析の六位置の反転・二つの経路・範囲の交差は、作例の内部整合として確認し、製品テストや利用観測として数えない。

コードを変更しないため、今回の文書検証からビルド・単体テスト・実機・利用価値の確認済みとは報告しない。試作する場合は対象の契約・UI・実データに応じた検証を次のIssueへ記す。

## Validation results

執筆観点での見直し後、対象16文書の212内部リンクとanchor、参照リンク定義、七つの要求と六つの受入場面、新規Issue IDの一意性を確認した。既存の`planning_queue.py`読取で0208はIn Progress、0209・0210はDraft、0211はOpenであり、関連ADRの不在はなかった。利用案内の二つのコマンド名は現在の登録と日本語表示に一致する。tracked文書の`git diff --check`も通った。

日本語の静的検査と目視推敲では、Issue様式の箇条書き比率、技術用語としての「正本」、操作説明の自然な文末の繰返し等を確認し、意味を保つために残した。今回の確認は文書とコード読解の範囲であり、製品のビルド・自動テスト・実機・利用価値の確認を含まない。

今回の執筆観点での見直し前に、2026-10-08の計画化対象8文書をdocs-checkで確認した。134内部リンクとanchor、参照リンク定義、24視点・96案・12交差案・8仮説の件数とIDの一意性、引用元の条件節、末尾空白、競合markerに問題はなかった。当時の`planning_queue.py`の読取では親IssueがIn Progress、子二件がOpenだった。現在の子二件はDraftであり、この記録を現在の採用状態と混同しない。

追加分析の六回の一位置反転、二つの経路、四つの範囲交差例を作例の内部整合として確認した。再読したCSWの華厳・ジャイナ・ニヤーヤ・易の四資料は、固定revisionの内容と一致した。これらは製品機能の検証や実務での効果観測ではない。

新規の採用計画・追加分析文書を日本語の静的検査と目視推敲にかけた。二つの説明文書には指摘がない。子Issueに残る箇条書き比率の指摘は、Meta・受入条件・実装順というIssue様式を保つため残した。

前段の会話内説明例では、headless Edgeで承認／差戻しと相違の有無の4状態を明暗両テーマで確認した。条件不足の保持、同条件の相違、状態保存・再読込み・復元、非互換な保存状態からの初期値への復帰が動作し、736・360・320pxの明暗表示に横はみ出しとJavaScript実行エラーはなかった。736pxの明テーマと320pxの暗テーマの画像も目視した。今回の計画化でその説明例を製品実装へ接続したり再試験したりはしていない。意味の自動抽出、MMI製品UI、実文書での精度、利用価値は未確認である。

## Remaining work

最初にissue-0211の併用執筆を進める。この親IssueではN01を目録・参照から目的の原本へ辿る仕事、N02を何の表を何のために使っていたか確認して執筆を再開する仕事へ戻して深める。通常の参照・Markdown追記で不足し、専用支援が役立つ具体例を示せた要素から次のIssueへ切り出す。

今回の見直しで利用者向けの最優先を明確にした。モデル導入や公開Candidate schema変更は決めていない。原本の読み取り専用、認識論・採否・実行特性の分離、人の執筆を止めない境界を継続する。
