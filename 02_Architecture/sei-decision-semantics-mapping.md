# SEIの判断の意味論との対応（参考）

## 1. 位置づけ

MMIの記録や責務の境界を、関連製品SEI（`hat47x/sei-cognition`）の用語でどう読み替えられるかを整理した参考資料である。MMIの要求、記法仕様、ADR、契約、実装は変更しない。MMIはSEIに依存せず、単独で成り立つ。

- [ADR-0018](../01_Plans/adr/ADR-0018-cognitive-assistance-plane.md)はAcceptedのため書き換えない。本書はその読み方を示すだけにとどめる。
- MMIの意味の正本はMMIにある。SEIは、家族の各製品がそれぞれ実装した「提案と決定の分離」を、統合せずに翻訳する対応表を提案している。対応表の正本はSEI側に置く案であり、本書はMMIの側から見た読みを示す。
- 証拠は設計の段階にとどまる。両製品のあいだで記録を実際に受け渡した例はない。

対応を検討する際に参照したSEI側の資料は、次のとおり。

| 資料 | 場所 | 状態 |
| --- | --- | --- |
| Semantic Reference、Decision Memory、Capability Observation、Semantic Interchangeの各契約と、Representation Profile 2件 | `hat47x/sei-cognition:contracts/`（`semantic-reference/`、`decision-memory/`、`capability/`、`interchange/`、`profiles/`） | SEIの`main`にある（いずれもv1alpha1） |
| 家族の判断の意味論の対応表 | `hat47x/sei-cognition:product/definition/SEI_FAMILY_SEMANTIC_MAP.md` | SEIの`main`にある（2026-10-09にマージ。MMIの行は「候補」） |
| 統合の頂点と制御の意味の境界 | `hat47x/sei-cognition:plan/adr/ADR-0035-family-integration-apex-and-control-meaning-boundary.md` | SEIの`main`にある（Proposed）。提案時のADR-0032から番号を付け直した |

## 2. 対応表

| MMIの記録・境界 | SEIでの読み | 変えないこと |
| --- | --- | --- |
| Authority Planeの判定（構文、パス解決、containment、読み取り専用、診断、準拠判定。ADR-0018 D1） | Authorityの側。SEIはこの判定を事実の根拠（Authority evidenceへの参照）として受け取り、自分で判定し直さない | 判定を持つのはMMIの決定論的コアだけ |
| Cognitive Assistance Planeの候補・判断・説明・提案（ADR-0018 D1・D2） | Recommendation。AIが出したことから、決定の権限を推定しない | 候補はAuthority Planeで再検証してから適用する（ADR-0018 D7） |
| 人による採否（Format Profileの承認、候補の採用。ADR-0018 D6、ADR-0019 D1） | 人によるDecision。候補と検証結果を決定の根拠として参照できる | 採否はMMIの利用者が決める。SEIの記録が代わりに決めることはない |
| providerの同一性・版・能力の種類、`unavailable`・`unsupported`（ADR-0018 D4・D5） | Capability Observation | providerの種類や、特定の製品との関係の近さから、信頼度や優先順位を推定しない |
| provider固有のconfidence（ADR-0018 D4） | Capability Observationの側では、provider固有の文脈として参照や拡張に残す | 異なるproviderのconfidenceを共通の尺度へ正規化しない |
| 参照（ファイル、シート、範囲、パラメータ）と、正本のSource Identity v1（`source-file-bytes-v1`） | Artifact ReferenceとExact Artifact Binding。digestの算出方式は`sei.raw-bytes+sha256/v1alpha1`にあたる | 表の正本は元のファイルにある。判断の記録にセル値を写さない |
| 構造化資料の観測（`hat47x.structured-artifact-observation/v0`） | producerと来歴を持つObservation | 製品ごとの観測を合成して一つの「正解」にしない |

## 3. 読み替えるときの注意

1. 「Authority」の意味の違い: ADR-0018のAuthority Planeは、事実と規約を決定論的に判定する層を指す。人や組織に決定の権限を与えるものではない。SEIのAuthorityは「決めてよい」という権限を指す。このため、MMIの判定はSEIではAuthorityの証拠として参照され、SEIのAuthorityそのものにはならない。
2. confidenceは比べない: ADR-0018 D4の「異なるproviderのconfidenceを同じ確率尺度とみなさない」は、SEIのCapability Observation §7（providerの種類やSEIとの関係の近さから、信頼度や優先順位を推定しない）と同じ向きの規律である。SEIへ写すときも、confidenceを共通のfieldへ格上げせず、平均や最大値で「総合スコア」を作らない。
3. abstention（候補を確定しない結果）を別の意味に変えない: `novel`・`ambiguous`・`abstained`は、既知の候補を一つに決められなかったという結果である。SEIでは、確定した候補のないRecommendation、またはUnknownとして読み、既知の候補へ割り当て直さない（ADR-0018 D5、SEIの`Unknown != incompatible`）。`unavailable`・`unsupported`はproviderの状態であり、Capability Observationの観測条件として読む。観測がないことを`unavailable`と同じに扱わない（SEIの`not observed != unavailable`）。
4. 参照文字列は所在を示す: MMIの参照文字列にはファイルパスが含まれる。SEIではファイルパスを論理参照そのものとしないため、記録する側は表を指す識別子を別に持ち、参照文字列を所在情報として添える。
5. digest（内容の同一性を照合する値）はファイル全体に対するもの: Source Identity v1は、解決した正本ファイルのバイト列全体を対象とし、参照した範囲だけの同一性を表すものではない。不一致は「範囲の内容が変わった」との断定ではなく、「判断時と同じ内容であることを確認できない」ことを示す。範囲に限った同一性は、ADR-0019の未解決事項（確定版のダイジェストの対象）で扱う。
6. 現行のマニフェストにdigestはない: 別紙マニフェスト（記法仕様§8.1）は出所のdigestを含まない。digestは[Source Identity Contract v1](source-identity-contract-v1.md)の規則で求める。表記はどちらも`sha256:`に続く小文字16進64桁で、同じバイト列からは同じ文字列になる。CLIでは、`mmi provenance <doc.md> --json`（`mmi.provenance-report/v1`、[ADR-0028](../01_Plans/adr/ADR-0028-per-document-provenance-report-contract.md)）が、Linked参照ごとに参照文字列（`reference`）と正本のSource Identity v1（`sourceDigest`）を返す。`check`と`manifest`のJSON出力には加えない。`check`は診断だけを返すゲートで、`manifest`は記法仕様§8.1の別紙の列を写す。どちらに加えても同じ値の出口が増えるだけになる（[#498](https://github.com/hat47x/markdown-matrix-injector/issues/498)で決定）。ADR-0028はProposedのため、採否が変われば本項も見直す。
7. 診断が出ないことは判断の正しさを示さない: MMIの診断がないことから分かるのは、表を参照どおりに描けるという範囲までである。本文の主張と表の内容が整合するかどうかは、ADR-0019 D4のとおり保証の対象外である。

## 4. 境界

- MMIのコード、テスト、配布物は、SEIの型やスキーマを読み込まない。対応が必要になったら、SEI側のadapterがMMIの出力（参照、診断、digest）を読む。
- MMIは読み取り専用のままである。記法に新しいパラメータを加えず、コアはネットワークから取得せず、参照はワークスペース境界の中で解決する。
- 認知機能の外部送信は、ADR-0018 D8のとおり明示的なopt-inのままとする。この対応は、SEIへの送信を求めない。
- 使い方は[記法仕様の付録](../04_Documentation/spec/mmi-notation-v1.md#付録-外部の判断記録で根拠を固定する非規範)、構造化資料の観測契約をv1へ上げる前の確認は[Structured Artifact Neutral Observation v0](structured-artifact-neutral-observation-v0.md)の§13、進め方は[issue-0192](https://github.com/hat47x/markdown-matrix-injector/issues/498)を参照する。
