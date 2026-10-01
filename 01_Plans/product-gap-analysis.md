# 製品価値と現行実装のギャップ

- 基準: [ADR-0019](adr/ADR-0019-ai-era-sier-document-value-and-policy.md)（2026-10-01 Accepted）と[製品要求](../00_Prompt/requirements.md)
- 測定日: 2026-10-01（`main`の`a4e0607`＋ベンチマーク`d015529`）
- 本書は差分の地図であり、作業順の正本は[現在の作業](README.md)とする。差分が解消したら行を消し、経緯は書き足さない。

## 1. 要約

MMIは「Linked（参照）」の状態だけを実装しており、その品質は高い。ADR-0019 D0・D13のとおり、人がExcelで書き続ける情報はLinkedのままでよく、Linkedは過渡期の仮の姿ではない。残り2状態「Extracted（取り込み）」と「Detached（切り離し）」は、要素技術の一部（原本の同一性、領域検出、書式認識の研究）はあるが、利用者が使える経路が1本もない。

| 状態 | 実装 | 主な不足 |
| --- | --- | --- |
| Linked | 実装済み（表のみ）。VS Code・CLIの両方から使える | 画像・図形・ツリーの参照がない |
| Extracted | 未実装 | Candidateの契約、画像の抽出、取り込み台帳、由来の記録 |
| Detached | 未実装 | 展開（`render`）は別紙カードを「別紙: パス」の1行に置き換えるだけで、原本を外すと情報が欠ける。`detach check`がない |

最大のギャップは、**研究層の成果（領域検出・書式認識・レビュー経路）とCandidateの間に契約がない**ことである。研究は直近200コミットの約8割を占めるが、追跡するIssueがなく、ADR-0019 D4のCandidate種別へ対応付けられていない。

## 2. 能力ごとの差分

状態の記号: ●実装済み、◐一部、○未実装。「証拠」は実装の場所または測定。

| 製品要求の能力 | 状態 | 現在あるもの（証拠） | 不足 | 優先度 |
| --- | --- | --- | --- | --- |
| 参照 | ● | MMI Notation v1、VS Codeプレビュー、CLI `render` | 表以外のCandidateの参照 | 2〜3 |
| 目録 | ◐ | CLI `inspect`（表の領域・見出し・行数。`src/cli/mmi.ts`） | 画像・図形・注記・リンクの列挙。Candidate形式の出力 | 1〜2 |
| 候補抽出 | ◐ | 製品: 表の領域検出（`src/search/regionDetector.ts`）。研究: 表らしさ・見出し境界（structured artifact）、既知書式（worksheet format） | 共通のCandidate型、`observed`/`inferred`/`confirmed`の区別、研究成果の製品への接続 | 1 |
| 個別取り込み | ○ | なし | Candidateをassets・Markdown・構造化データへ書き出す`extract` | 2 |
| 一括変換 | ○ | なし | 既存変換器の評価、取り込み台帳との接続 | 2（後半） |
| 重複回避 | ○ | 原本の同一性（`src/core/sourceIdentity.ts`、ファイル全体のsha256） | Candidate単位のfingerprint、取り込み台帳、「未取込のみ」の表示 | 2 |
| シートの画像化 | ○ | Windows補助プロセスの前例（ADR-0017、クリップボード） | 図形・レイアウトに意味があるシート・範囲を画像として取り込む`Sheet / Region snapshot`（ADR-0019 D0）。CIで再現できる描画を優先し、COMは手元の補助（ADR-0019 D14。いずれも未検証） | 2 |
| 構造化 | ○ | なし（研究に階層関係のラベル`region.hierarchy_relation`がある） | JSON/XMLの明示ツリー、配置からの推定ツリー | 3 |
| 変換・表示 | ● | 変換パイプライン、強調、コード表示、キャプション | 画像参照の表示 | 2 |
| 検証 | ● | 診断コード6種、CLI `check`（JSON・終了コード） | Candidate・取り込み結果の診断 | 2 |
| provenance | ◐ | Source Identity v1、納品物一覧（パス・範囲・理由） | 取り込み結果ごとの出典・変換条件・ダイジェストを記したmanifest | 2 |
| materialize | ◐ | CLI `render --to md`（表をGFM表へ展開） | 別紙カードの実体化（現在は「別紙: パス」の1行）、画像の実体化 | 4 |
| detach check | ○ | なし | 未展開参照・未取込資産・壊れたリンクの列挙 | 4 |
| 執筆支援 | ● | 補完、貼り付け（Windowsの出所取得を含む）、説明からの検索、案内付きの作成、ホバー | 多環境の実機確認（issue-0110）、利用者の観測（issue-0111） | 継続 |
| AI/CI利用 | ◐ | CLI 4コマンド、AI向け指示パック（`skills/mmi`）、基本設計書キット、執筆ベンチマーク v0 | 配布（npm等）、`extract`、Candidate形式のJSON、MCP | 1 |
| 応答性 | ● | 読込みの再利用と失効、検索索引の差分更新 | 画像を含む大きなブックでの測定 | 2 |

## 3. 測定で分かったこと

- **執筆ベンチマーク v0（[結果](../04_Documentation/benchmarks/ai-writing/results/2026-09-30-v0.md)）:** 12行程度の表では、MMIなしでもAIは表を誤って写さなかった。差が出たのは正本の変更後で、写した表は古くなり、参照した表は追従した。Linkedの価値は単発の正確さより追従にある。ADR-0019がExtracted・Detachedへ価値を広げたことと整合する。
- **本文と表の矛盾は未検出:** 正本の変更後、参照した表は追従したが、本文の説明（「申請者は承認できない」）は古いまま残った。ADR-0019 D12のとおり業務的正しさは保証外だが、人がExcel側を直し続ける運用では、Markdown側の本文が気づかれずに古くなる危険がある。
- **人の作業を止めない設計の未検証:** 現行の診断は、VS Codeで書いている最中にも「問題」パネルへ同じ強さで出る。ADR-0019 D13の「執筆中は控えめに、レビュー・CI・AIには網羅的に」の区別はまだない。
- **画像の読み取り:** 依存を増やさずに、SheetJSの`bookFiles`からxlsx内の任意の部品（`xl/media/*`、`xl/drawings/*.xml`）を取り出せることを確認した。ただし画像を含む実物のブックはリポジトリになく、anchorの解析は未確認である。

## 4. 計画と運用の差分

| 差分 | 影響 | 対応 |
| --- | --- | --- |
| 研究（structured artifact SAI-0〜2B、review route）に追跡Issueがない | 製品の優先度と無関係に研究が進み、Candidateへ合流しない | issue-0193で研究成果をCandidate種別へ対応付ける |
| [現在の作業](README.md)のADR-0017の記述が「未決定」のまま | 実際はAccepted・実装済み（2026-09-25）。誤った前提で作業を選ぶ | READMEを訂正（本改訂で実施） |
| `planning_queue.py`が補足付きの状態（`In Progress（…）`）を未完了と判定しない | issue-0110・0111・0115・0190が一覧から漏れる | 状態の先頭語で判定するよう修正（本改訂で実施） |
| issue-0190の状態が独自表記（`Implementation complete; local execution pending`） | 一覧で拾えない | 規定の状態（In Progress）へ直す |
| 優先度1〜5に対応するIssueがない | ADR-0019の採択後の作業5が未着手 | issue-0193〜0197を起票（本改訂で実施） |
| 執筆中とレビュー時で診断の出し方を分けていない（ADR-0019 D13） | 人の執筆を止める可能性 | 優先度2のVS Code UIの設計で扱う。測定は利用者の観測（issue-0111）で行う |
| `xlsx`の依存がCDNのtarball | CLIをnpmで配布するときの障害になり得る | issue-0197で配布形態と合わせて判断 |

## 5. 既存の研究とCandidateの対応（案）

研究の成果を捨てず、ADR-0019 D4・D6の枠へ置き直す。確定はissue-0193で行う。

| 研究の成果 | 対応するCandidate | 層（ADR-0018） | 状態 |
| --- | --- | --- | --- |
| 表の領域検出（製品、`regionDetector`） | Table / Range | Authority（規則） | `observed`に近い。見出しの確度は`inferred` |
| structured artifact の`table_like`・`header_boundary`・`repeated_block` | Table / Range、Section | Perception | `inferred` |
| structured artifact の`hierarchy_relation` | Tree / Hierarchy | Perception | `inferred` |
| structured artifact の`ambiguous_or_non_table`（連絡先カード、箇条書き等） | Note、List、Section | Perception | `inferred`または`abstained` |
| worksheet format（既知書式の一致・曖昧・新規） | Candidateの書式プロファイル | Perception | `inferred` |
| review route（inspect / routine） | Candidateのレビュー優先度 | Judgment | 候補の属性。確定はしない |
| CPU範囲探索（FlyHash等） | Candidateの検索 | Perception | 候補順位 |
| Excel貼り付けの出所照合 | Table / Rangeの確定 | Authority（照合） | `confirmed`への経路 |
