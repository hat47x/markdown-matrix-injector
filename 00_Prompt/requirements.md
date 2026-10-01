# MMIの製品要求

## 目的

MMIは、既存の業務文書・構造化データを読み取り専用で扱い、そこに含まれる再利用可能な情報単位と関係をMarkdown中心の資産へ段階的に移行するためのモダナイズ基盤である。

**MMIは、Excel方眼紙の文書をレガシーとみなす見方と、その書き方に合理性があるとする見方の両方を否定せず、両者の尊厳を保つ橋になる。** 罫線・セル結合・AutoShape・画面ダンプを併用して図表で設計を整理する書き方を正当なsourceとして扱い、移行を求めない。同時に、顧客納品物として固定されてきたOffice文書の位置付けが生成AIによって揺らぎ、Excelの文書がAIとの協業でまだ扱いにくいことを現実の課題として受け止め、Markdownへ移りたい人が資産を失わずに移れるようにする。図形やレイアウトに意味があるシート・範囲は、そのまま画像として取り込んでよい（[ADR-0019](../01_Plans/adr/ADR-0019-ai-era-sier-document-value-and-policy.md) D0）。

原本をすぐに捨てることは前提にしない。移行途中は原本を正本または根拠として参照でき、必要な情報を表・画像・ツリー等として段階的に取り込めるようにする。最終的には標準Markdown、通常の画像・添付、一般的な構造化データへ実体化し、原本やMMIを外しても成果物が成立する状態を目指す。

現行実装の主な対応範囲はExcel・CSV・TSV・XML Spreadsheet 2003の表参照とVS Code上の執筆支援である。将来の製品範囲と、現在実装済みの機能を混同しない。

成果物は、MMI Notation、共通エンジン、CLI等の機械利用可能な入口、VS Code拡張、変換・取り込み支援、実務サンプルと日本語の利用文書である。実装状態と未解決事項は[現在の作業](../01_Plans/README.md)で管理する。本書は開発順序や過去の進捗を記録しない。

製品価値と優先度の決定正本は[ADR-0019](../01_Plans/adr/ADR-0019-ai-era-sier-document-value-and-policy.md)とする。

## 守る境界

- **人の作業を止めない:** 人が慣れた道具・書き方で最速に書ける経路を妨げない。候補の採否や形式の統一を、執筆や利用開始の条件にしない。移行の範囲とペースは人が決める（[ADR-0019](../01_Plans/adr/ADR-0019-ai-era-sier-document-value-and-policy.md) D0・D13）。

- **読み取り専用:** 参照・解析・候補抽出・取り込み支援の過程でsourceを改変しない。元データの編集は対象外。
- **事実と推定の分離:** 原形式に明示された構造、規則や認知処理で推定した構造、人が確認した構造を区別する。
- **正確な参照:** ファイル・シート・原本座標・source locator・変換条件の意味を保持する。
- **見える失敗:** 不在ファイル、無効な指定、非対応形式、曖昧な候補、表示できない条件を利用者へ示す。推測した結果を確定情報として扱わない。
- **再現可能性:** Authority Planeでは、同じ入力・source・設定から同じ結果を得られるようにする。
- **アクセス範囲:** 許可された参照範囲を守る。信頼されていない内容をコードやエージェント指示として実行しない。
- **由来の保持:** 取り込んだ情報について、可能な限りsource locator、変換条件、fingerprintまたはdigest、確認状態を追跡できるようにする。
- **離脱可能性:** MMI固有形式へ不可逆に囲い込まない。標準Markdown・通常の添付・一般的な構造化データへ実体化できる経路を持つ。

## モダナイズの状態

同じプロジェクト内で、次の状態を混在可能にする。

| 状態 | 要求 |
| --- | --- |
| Linked | レガシーsourceを残したまま、必要な断面を宣言的・読み取り専用で参照できる |
| Extracted | 表・画像・ツリー等を標準資産へ取り込み、元sourceとの対応とprovenanceを残せる |
| Detached | 必要情報を実体化し、元sourceやMMI固有機能を外しても成果物が成立する |

Detachedはプロジェクト全体の一括移行を要求しない。3状態は順に進むべき段階ではなく、情報単位ごとに選ぶ状態であり、人がExcelで書き続ける情報はLinkedのままでよい。文書、章、シート、範囲、画像などの単位で段階的に移せるようにする。

## 情報単位と候補

入力形式のオブジェクト型と、利用者が取り込みたい意味的単位を分離する。共通のSemantic Candidateとして、少なくとも次を検討対象とする。

| Candidate | 例 |
| --- | --- |
| Table / Range | Excelセル範囲、CSV、XML表 |
| Image / Screenshot | Excelに貼られた画面ダンプ、画像 |
| Sheet / Region snapshot | 図形・罫線・レイアウトに意味があるシートや範囲を、そのまま画像として取り込んだもの（CIで再現できる描画を優先し、ExcelのCOM操作は手元の補助に限る） |
| Shape / Text box | AutoShape、吹き出し、テキストボックス |
| Diagram | 図形とconnectorの関係 |
| Tree / Hierarchy | JSON/XMLネスト、インデント、番号体系、親列、行グループ |
| Choice list / List | 選択肢、Data Validation、箇条書き |
| Note / Comment | 注記、コメント |
| Link | ハイパーリンク、参照 |
| Section | 見出し、文書区画 |

Candidateは `observed` / `inferred` / `confirmed` を区別できること。推定候補はmethod、evidence、provider/version、provenanceを保持し、曖昧な場合はabstainできること。

## 認知方式と実行特性

認知機能は機械学習やLLMに限定しない。要件ごとに、明示構造の抽出、決定論的な規則・幾何・グラフ・統計、軽量類似、bounded Judgment、local generative reasoning、外部LLM handoffを比較し、**最も単純で十分な方式**を選ぶ。決定正本は[ADR-0020](../01_Plans/adr/ADR-0020-requirement-oriented-cognition-method-selection.md)とする。

Candidateや認知結果は、少なくとも次の2軸を分けて表現できること。

| 軸 | 値 | 意味 |
| --- | --- | --- |
| 認識論上の状態 | `observed` / `inferred` / `confirmed` / `abstained` | 原本事実か、推定か、確認済みか、判断保留か |
| 実行特性 | `deterministic` / `provider-dependent` | 同じ入力・設定・実装versionで結果を固定できるか |

決定論的な推定であっても原本事実とは限らない。例えば、OOXMLから取得した画像anchorは `observed + deterministic`、固定した近接規則による「画像と表の関連」は `inferred + deterministic` とする。

実行モデルは決定論性に応じて分ける。

- **deterministic path:** Coreの通常経路に置ける。入力digest・設定・実装versionをcache keyにでき、CI/conformanceで完全一致を検証できる。Authority仕様に属するものだけ自動適用してよい。
- **provider-dependent path:** 編集をブロックしない任意経路とする。provider/model/version/parametersをprovenanceへ残し、`abstained` / `unavailable`を正常系にする。結果はproposal-onlyで、Authority Planeで再検証する。
- provider-dependent処理が利用できなくても、参照・検証・抽出等の基本経路を壊さない。
- 高コストな方式へ自動fallbackしない。より複雑な方式を採用する場合は、下位の方式では不足するfixtureまたは利用実績を示す。
- 外部LLM handoffは内部fallbackではなく別経路とし、MMI自身は送信しない。

## データソース

### 現行の保証対象

- CSV / TSV
- Excel
- XML Spreadsheet 2003

構文、既定値、変換順序、診断、準拠レベルは[MMI記法仕様](../04_Documentation/spec/mmi-notation-v1.md)を正本とする。

### 拡張候補

Source Adapterとして、次を段階的に評価する。

- 汎用XML
- JSON / YAML
- フラットテキスト
- 画像・図形を含むOffice文書
- その他の業務文書形式

形式を追加しただけで対応済みとしない。Candidate抽出、provenance、失敗時の挙動、性能、detachabilityを個別に検証する。

## 提供する能力

| 領域 | 要求 |
| --- | --- |
| 参照 | Markdownからsource、シート、範囲等を指定し、必要な断面を読み取り専用で参照する |
| 目録 | AIや人がsource全体を丸読みせず、構造、候補、位置、見出し等を把握できる |
| 候補抽出 | 表、画像、ツリー等の候補を列挙し、明示構造と推定構造を区別する |
| 個別取り込み | 選んだCandidateをMarkdown、assets、構造化データへ取り込み、由来を残す |
| 一括変換 | 初回モダナイズ時に既存変換器を活用できる。MMI固有のprovenanceや候補情報を失わない |
| 重複回避 | プロジェクト中で取り込み済みのCandidateを追跡し、未取込のみ等の表示を選べる |
| 構造化 | JSON/XML等の明示ツリーを保持し、フラットテキストや配置からは推定構造を候補として生成する |
| 変換 | 範囲、列抽出、転置、見出し、行絞込み等を規定された順序で適用する |
| 表示 | 表、画像参照、強調、コード形式、キャプション、相互参照等を提供する |
| 検証 | 参照・変換・取り込み結果を安定した診断コードと機械可読結果で確認できる |
| provenance | source locator、digest/fingerprint、変換条件、確認状態、出力先を追跡できる |
| materialize | MMI参照を標準Markdown・添付へ展開できる |
| detach check | 未展開参照、未取込必須資産、壊れたリンク等を列挙し、sourceを外せる状態か確認できる |
| 執筆支援 | ファイル・シート・文法の補完、参照診断、貼り付け、検索、候補レビューを支援する |
| AI/CI利用 | CLIとmachine-readable outputから、inspect/check/render/extract等を呼び出せる |
| 応答性 | 読込み・索引を再利用し、source更新で失効させる。巨大データで編集操作を長時間止めない |
| 利用文書 | 導入手順、期待結果、実務サンプル、対応条件、未対応範囲を自然な日本語で説明する |

## 提供形態

VS Code拡張だけをプロダクト本体としない。同じCore engineと契約を複数の入口から利用できることを目標とする。

- Core engine / library
- CLI
- machine-readable schema / diagnostics / manifest
- AI向けskill・instructions、将来のMCP等のagent integration
- VS Code extension
- 外部converter / rendererとの統合

新しい能力は可能な限りCoreへ置き、特定UIにだけ存在する実装を避ける。

## 認知資産の配布

model weight、prototype、index、embedding、Format Profile等の認知資産は、Core binaryとは別に管理・配布できること。

- 小さな規則・schema・profileは同梱可能とするが、大型modelを基本配布へ無条件に埋め込まない。
- 認知資産はartifact id、kind、version、digest、byte size、license、取得元、provider互換version、schema versionをmanifestで識別する。
- 大型artifactは機能利用時の明示取得を基本とし、初回起動時に暗黙downloadしない。
- download後はdigestを検証し、local cacheを利用する。offline時にartifactが無い場合は認知機能だけを `unavailable` とし、Authority Planeを継続する。
- GitHub repository、GitHub Release / LFS、model hub、object storage等を差し替え可能なartifact sourceとして扱う。特定サービスをCore契約に埋め込まない。
- 認知方式を比較するときは、モデル精度だけでなくdownload size、disk size、更新差分、cold start / cold availability、offline usabilityも評価する。
- 外部model repositoryからweightを取得することと、外部生成AI APIへsourceを送信することを明確に区別する。

## AI / LLMとの関係

MMI自体が課金を要する生成AIサービスを利用することは原則としない。Core、CLI、VS Code参照実装はAPIキー管理、課金型LLMへの自動送信、自動クラウドfallbackを標準機能に含めない。例外が必要になった場合は別ADRで判断する。

MMIとLLM・認知技術の関係は次の3つを基本とする。

1. **外部LLMから利用される:** 利用者が選んだLLM / AIエージェントがCLI、skill、将来のMCP等からMMIを呼び、inspect / check / render / extract / manifest等を利用する。外部AIの契約・課金はMMIの外側に置く。
2. **軽量・ローカルな認知を内部で使う:** Fly-inspiredな疎表現、Jev類似技術、bounded classifier、ローカルLLM等を、Excel解析、構造候補、類似検索、限定判断へ利用できる。外部API課金を前提にしない。
3. **外部LLM向けに作業提案と判断材料を生成する:** Candidate、source locator、provenance、診断、限定した抜粋から、利用者が外部LLMへ渡せる依頼文・prompt・evidence packageを生成する。MMI自身は送信しない。外部LLMから戻った提案はAuthority Planeで再検証する。

特定の生成AIサービスを製品の必須依存にしない。外部LLMが存在しない環境でも、Authority Planeと主要なモダナイズ機能は成立する。


## 配布サイズとランタイム

MMIは、CLI、Core、IDE連携、WASM等の各経路で、必要な機能・安全性・互換性を満たす範囲では**最小の配布物と最小の実行時依存**を優先する。

- Core実装を特定のコンパイラ固有機能へ強く依存させない。
- Go採用時は、標準Goを基準にしつつTinyGo等のsmall-binary toolchainでもビルド可能なportable coreを優先する。
- 標準GoとTinyGoで挙動差がある場合は、conformance corpusと公開契約の一致を優先し、サイズのためにAuthority Planeの保証を弱めない。
- VS Code Web等ではWASMを選択できる構造にする。Desktopではnative binaryとWASMを実測比較し、機能要件を満たす最小経路を採用する。
- 将来、標準Goに近い互換性を持ちながらより小さなnative/WASMを生成できるtoolchainが成熟した場合、同じ契約で評価して置換可能にする。
- toolchainの採否はバイナリサイズだけでなく、対応標準ライブラリ、性能、メモリ、デバッグ性、保守性、ライセンス、OS/WASM対応を含めて判断する。

## AI・認知技術との3経路

MMI自身は、原則としてAPI課金を要する生成AIサービスを直接呼び出さない。API key管理、課金先の選択、自動クラウドfallbackを標準機能に含めない。MMIとLLM・認知技術の関係は次の3経路に整理する。

1. **外部LLMからMMIを利用する:** 利用者が選んだChatGPT、Claude、Codex等の外部LLM / AIエージェントが、CLI、AI向けskill、将来のMCP等からMMIを呼び出す。MMIはinspect / check / render / extract / manifest等の決定論的・機械可読な能力を提供する。
2. **MMI内部では軽量・ローカルな認知を利用する:** 決定論的規則を第一にし、Fly-inspired matcher、Jev類似のbounded model、必要に応じたローカルLLM等を、Excel解析、構造候補、類似検索、閉集合判断へ利用できる。外部API課金を必須条件にしない。
3. **外部LLMへ作業提案と判断材料を渡す:** MMIは、未解決診断、曖昧なCandidate、source locator、provenance、必要最小限の抜粋から、外部LLMへ渡せるprompt / evidence packageをローカル生成できる。送信、LLM選択、課金は利用者側の責務とし、戻された提案はAuthority Planeで再検証する。

外部LLMが無くても、MMIの基本機能とローカル認知は動作しなければならない。将来MMI自身から課金型生成AIサービスを直接呼ぶ必要が生じた場合は、標準機能へ暗黙に追加せず、別ADRで費用、privacy、再現性、fallback、無効時の挙動を定める。

## 認知支援

MMIの決定論的なAuthority Plane（parser、resolver、query semantics、containment、Read-only、diagnostics、rendering、conformance）は認知処理から独立を保つ。

Cognitive Assistance Planeは、レガシー文書の暗黙構造を低コストに候補化する中核能力として育てる。ただし、候補・説明・提案を返すだけで、source事実、Notation解釈、containment、Read-only判定、diagnostics、conformanceを上書きしない。

優先順は次とする。

1. 決定論的parser、metadata、layout規則
2. ローカルCPUで動く疎表現、類似検索、bounded classifier（Fly-inspired、Jev類似技術等）
3. 必要箇所だけを扱うローカルLLM

同じsourceとMMI記法に対し、認知機能のON/OFFでAuthority Planeの論理表・診断が変化してはならない。外部LLMはCognitive Assistance Planeの標準providerとしてMMIから呼び出さず、上記「AI / LLMとの関係」の1または3の経路で利用する。決定正本は[ADR-0018](../01_Plans/adr/ADR-0018-cognitive-assistance-plane.md)とする。

## 公開品質

公開する能力について、少なくとも次を確認する。

1. 実装済み、テスト済み、実機確認済み、利用者による価値確認済みを区別する。
2. 参照・取り込み前後でsourceデータが変わらない。
3. observedとinferredを表示・API上で区別できる。
4. 推定候補の誤確定を隠さず、曖昧時にabstainまたは人の選択へ戻せる。
5. provenanceから元sourceと変換条件を追跡できる。
6. materializeした成果物は一般的なMarkdown・添付として読める。
7. detachabilityを主張する場合は、sourceを外した状態で成果物とリンクを検証する。
8. 対応ホスト、形式、範囲、性能、認知機能の制約を実測と一致させる。

自動テストの合格だけでは、実機操作、文書品質、取り込み品質、detachabilityの確認を代替できない。

## 当面の実装焦点

現行表参照機能を維持しながら、次の縦切りを優先する。

1. CoreとCLIから既存のinspect/check/render機能を利用できるようにする。
2. Source Adapter / Candidate / provenanceの共通契約を定める。
3. Excel埋め込み画像を列挙し、anchorとsourceを保持してassetsへ取り込む。
4. プロジェクト内で取り込み済み画像を判定し、未取込のみを候補表示できるようにする。
5. 表と画像を同じCandidate系で扱い、初回一括変換と個別取り込みの両方を成立させる。
6. その後、Shape、Tree、Choice list、JSON/XML、フラットテキストへ広げる。
7. materialize / detach checkへつなぐ。

これは製品方向と要求であり、未実装の項目を既存機能の保証として扱わない。