# VSCode Extension Host E2E Test Architecture

## 1. Goal
- この文書は、VSCode Extension Host E2Eにおける**設計上の境界線**を固定する。
- 対象は、DXロジック本体・VSCode統合層・Markdown Preview結線・E2E検証レイヤ・manual E2E補完領域の責務分離である。
- 本文書はarchitecture境界の固定を目的とし、実装詳細・テスト実装詳細・manual runbook手順は保証対象に含めない。
- 特にissue-0010の受入条件に対し **native canonical path / fallback compatibility path / shared-logic boundary / known unstable separation** を、ADR-0010 G1品質ゲートに対し **Markdown Previewの中核描画をautomation scopeに含める** ことを、architecture上の責務として明文化する。
- 実行手順、チェックリスト、再現方法、失敗時オペレーションの詳細は `04_Documentation/vscode-e2e-testing.md` に委譲し、環境前提やセットアップ入口は `04_Documentation/developer-setup.md` に委譲する。

**[2026-05-31 ADR-0010改訂]** Phase 6以前、Preview/Webview DOMの確認を「delegated manual scope」に恒久退避していた。しかし本プロダクトの中核価値（`![[...]]` 埋め込みをプレビューにインライン表示する）はPreview描画が達成されて初めて実現される。「検証対象外」ではG1品質ゲートを満たせないため、**自動で取れる範囲（生成HTMLの構造・期待クラス/属性・ブロック描画・no-`<p>`-wrap）をautomation scopeへ引き上げる**。視覚の最終確認（スクリーンショット・印刷）のみmanual scopeに残す。

## 2. Architecture decision summary
1. **自動E2Eの主対象はExtension Host APIレベルの統合確認**とする。
2. **native paste/drop provider** をPaste / D&Dのcanonical pathとし、通常hostではこの入口を優先保証対象に含める。
3. host capabilityやAPI制約でnative providerを使えない場合に備え、**command fallback** をcompatibility pathとして残し、unsupported hostを吸収する。
4. native providerとcommand fallbackは、同一のDXロジックへ収束させ、解析仕様を二重化しない。
5. OSネイティブイベントから最終的にeditor editが反映されるUX確認は、設計上 **delegated manual scope** の責務とする。
6. headless VSCode 1.112系のautocomplete不安定要因は、Paste / D&D受入判定から切り離した **known risk** として扱う。
7. architecture文書は「何をどこまで保証対象に含めるか」を固定し、具体的な運用手順はdocumentationに委譲する。
8. **[ADR-0010] Markdown Previewの中核描画（`extendMarkdownIt` による `![[...]]` のblock-level出力）はautomation scopeに含める**。具体的には: 生成HTMLの構造（`<figure>`/`<table>`/`mmi-*` クラス）、block描画（`<p>` ラッパーを持たないこと）、`env.currentDocument` 経由のパス解決をExtension Host上で確認する。視覚のスクリーンショット確認はdelegated manual scopeに残す。

## 3. Layered responsibility boundaries

### 3.1 DXロジック本体
- 対象: `03_Implement/src/dx/*`は次のとおりです。
- 責務は次のとおりです。
  - autocompleteの候補生成規則
  - diagnosticsの判定規則
  - clipboard / dropped file / DataTransferの解析規則
  - native provider / command fallbackの双方から再利用されるembed生成ロジック
- 非責務は次のとおりです。
  - VSCode APIへの登録
  - host capability判定
  - 実エディタ上でのUX挙動保証
  - fallbackを公開するかどうかの運用判断
- 設計原則は次のとおりです。
  - 仕様正本はロジック側に集約し、native providerとcommand fallbackの双方で再利用する。
  - 解析ロジックを二重実装しない。
  - issue-0010の受入条件における「既存 `pasteDrop.ts` 再利用」は本層の関心として守る。

### 3.2 VSCode統合層
- 対象: `03_Implement/src/extension.ts`
- 責務は次のとおりです。
  - Completion Provider / Diagnostics / native providerの登録
  - host capabilityに応じたfeature exposure
  - unsupported host向けcommand fallbackの公開
  - native providerをcanonical path、command fallbackをcompatibility pathとして露出させる境界管理
- 非責務は次のとおりです。
  - clipboard/filepath解釈ロジックの再定義
  - E2Eテストケース固有の判定
  - manual E2Eの運用手順定義
- 設計原則は次のとおりです。
  - 統合層は「VSCodeにどう接続するか」を担い、「何を返すか」の仕様はDXロジック本体へ委譲する。
  - native providerが利用可能なhostではそれを優先し、fallbackは互換性維持のためにのみ公開する。
  - fallbackはnative providerの代替実装ではなく、unsupported hostを吸収する互換境界として扱う。

### 3.3 E2E検証レイヤ
- 対象: `03_Implement/test/e2e/**`
- 責務は次のとおりです。
  - 実際のVSCode Engine上で、公開surfaceの統合結果を検証する。
  - render / completion / diagnostics / native provider adapter / command fallbackをAPIレベルで確認する。
  - Paste / D&Dでは、native providerが正規入口として登録され、同一解析ロジックへ委譲され、非対応hostではcommand fallbackが互換経路として残ることを確認する。
  - verification boundaryをissue-0010の受入条件1〜4に対してtrace可能な最小線へ固定する。
  - issue-0010の完了判定に必要な最小限のverification boundaryを自動検証対象として保持する。
  - **[ADR-0010追加] Markdown Preview中核描画のautomation検証**: `extendMarkdownIt`（本番プレビュー入口）経由で `![[...]]` をrenderし、生成HTMLの構造（`<figure class="mmi-embed">`/`<table class="mmi-table">`/`mmi-*` クラス/属性）とblock描画（`<p>` ラッパーを持たないこと）をExtension Host上で確認する（`test/e2e/suite/extensionHost.test.ts`: `markdown-preview-entry` stage）。
- 非責務は次のとおりです。
  - Preview DOMの**視覚**保証（スクリーンショット確認はdelegated manual scope）
  - ProblemsパネルUIの視認性保証
  - OSネイティブpaste / drop eventの最終挙動保証
  - autocomplete不安定時の運用判断や回避策策定
  - manual runbookに書くべきhost別操作順・再現手順・証跡採取手順の定義
- 設計原則は次のとおりです。
  - E2EはVSCode APIから観測できる事実のみをautomation scopeに含める。
  - **[ADR-0010] Preview中核描画のHTML構造確認をautomation scopeに含める。** 視覚微調整・スクリーンショット・印刷検証はdelegated manual scopeに委ねる。
  - native provider surfaceの存在確認とfallback互換性確認を優先し、UI/OS依存が強い経路はdelegated manual scopeに切り分ける。
  - 既知の非決定的要因はboundary外として隔離し、Paste / D&D受入判定と混線させない。

### 3.4 Delegated manual scope
- 対象: `04_Documentation/vscode-e2e-testing.md` に記述される運用・確認手順
- 責務は次のとおりです。
  - Preview / Webview DOMの**視覚**確認（スクリーンショット取得・実際の見た目確認。HTML構造の正しさはautomation scopeで担う）
  - ProblemsパネルUIの確認
  - suggest widgetの操作感確認
  - OSネイティブpaste / drag-and-dropからeditor editが反映される最終経路の確認
  - native providerがeditor UXとして自然に機能するか、およびfallback導線が必要なhostで運用上破綻しないかの最終確認
  - automation boundaryの外側にあるhost別手順・観測順・比較順をmanual runbookとして保持すること
- 非責務は次のとおりです。
  - DXロジックや統合層の仕様決定
  - 自動E2Eの代替となる詳細実装説明
  - architecture境界そのものの再定義
  - provider / fallback / shared logicの保証対象を拡張・縮小する判断
- 設計原則は次のとおりです。
  - manual E2Eは、自動E2Eで保証しないUX/OS依存領域の補完に限定する。
  - 運用上の詳細チェックリストはdocumentationに保持し、architecture文書へ逆流させない。

## 4. Paste / D&D boundary contract

### 4.1 Canonical path boundary
- Paste / D&Dの正規入口は **native paste/drop provider** である。
- このsurfaceをcanonical pathと固定する理由は、VSCodeが提供するnative API surfaceに乗ることがeditor統合として最も自然であり、issue-0010の「native provider surfaceから発火できること」をarchitecture上の基準にできるためである。
- ここでいう「発火できること」は、OSイベントの完全再現ではなく、**統合層からnative provider surfaceが公開され、Extension Hostから呼び出し可能な構造であること**を指す。
- よってacceptance criteria 1のarchitecture上の裏付けは「native surfaceの可視性と接続性」であり、最終UXの自然さはdelegated manual scopeに残す。

### 4.2 Compatibility path boundary
- hostにnative provider APIが無い、または安定して利用できない場合がある。
- そのため **command fallback** を残し、native providerと同じ解析ロジックを通してembed文字列を生成する。
- command fallbackは暫定実装ではなく、**unsupported hostを支えるcompatibility path** としてarchitectureに含める。
- issue-0010における「fallback方針が明示されること」は、native providerを置き換えることではなく、host capability不足時の互換入口を維持する方針を明示することを指す。
- このcompatibility pathは、manual runbookの操作代替ではなく、統合層が保証対象として持つAPIレベルの後方互換境界である。

### 4.3 Shared-logic boundary
- native providerとcommand fallbackは、入口は分かれていても **DataTransfer / dropped file解析とembed生成の仕様正本を共有**する。
- したがってarchitecture上の境界は「surfaceは複数でも、解釈ロジックは単一」である。
- このshared logic boundaryでは、DXロジック本体が唯一の解釈責務を持ち、VSCode統合層とE2E検証レイヤはその仕様正本を書き換えない。
- issue-0010における「既存 `pasteDrop.ts` を再利用し、重複実装しないこと」は、このshared-logic boundaryに対応する。
- shared logicはnative / fallbackの双方にまたがる仕様正本であり、テスト補助コードやmanual runbookから新たな解釈を持ち込まない。

## 5. Verification boundary

### 5.1 Automation scope
- 自動E2Eが保証するのは以下までとする。
  - native providerを登録できるhost capabilityがあること
  - providerがnative surface経由で呼び出されうる統合形になっていること
  - providerが再利用するDataTransfer解析ロジックが期待どおりであること
  - unsupported hostでもcommand fallbackがcompatibility pathとして成立すること
  - native providerとcommand fallbackが別々の解析仕様へ分岐していないこと
- したがってissue-0010の受入条件における『native provider surfaceから発火できること』『既存ロジックを再利用すること』『fallback方針が明示されること』は、自動E2Eの設計対象に含まれる。
- ここでのautomation boundaryは **provider/fallbackの仕様境界** に限定し、headless prerequisiteの充足有無そのものはpass/failの対象ではなく、後段のtriage前提として扱う。
- acceptance criteria 4に対しては、unit詳細をarchitectureに持ち込まず、Extension Host E2Eがどこまで退行検知を担うかというverification boundaryの固定だけを本書の責務とする。

### 5.2 Delegated manual scope
- 自動E2Eが保証しないもの。
  - OSネイティブeventからeditor editが適用される最終挙動
  - 操作感やUI上の導線
  - hostごとのメニュー導線や権限差分を含む運用確認
  - Preview / Problems / suggest widgetの視覚確認
- これらはdocumentationに記述されるmanual E2Eへ委譲する。
- ただし委譲先はrunbookの内容そのものではなく、『どの種類の確認を委譲するか』というdelegated manual boundaryの定義に限る。

### 5.3 Verification boundary rule
- Paste / D&Dの受入判定は、canonical pathの公開、compatibility pathの維持、shared logicの単一性までで閉じる。
- headless prerequisiteの欠落でExtension Host自体を起動できない場合は、provider/fallback仕様の失敗として解釈せず、**verification entry condition未充足** として別系統で扱う。
- autocompleteの安定性、visual UI、OSレベル最終挙動は、同一テストスイートに存在してもPaste / D&Dのacceptance boundaryに流入させない。
- これにより、issue-0010のautomation boundaryとdelegated manual boundaryを相互に独立した設計判断として維持する。

### 5.4 Guarantee / delegation rule
- architecture文書が保証するのは、**canonical path・compatibility path・shared logic・known risk isolation** の境界定義までである。
- architecture文書は、native providerが優先入口であり、fallbackが互換入口であり、両者が同一ロジックへ収束し、autocomplete known unstableがPaste / D&D acceptance boundaryに混入しないことを保証対象として固定する。
- 一方で、各hostでどのUI操作を行うか、どの順にmanual scopeを確認するか、失敗時にどう切り分けるかはdocumentation側へ委譲する。
- したがってautomation scopeとmanual scopeの境界はarchitectureが決めるが、運用手順そのものはarchitectureの責務に含めない。

## 6. Headless execution boundary
- Extension Host E2Eは、Docker / CIのheadless環境でもVSCode Engineを起動できる構成を前提とする。
- ただしheadless実行の成立は「E2Eを実行可能にする環境前提」であり、手順や依存パッケージの詳細は運用文書へ委譲する。
- architectureとして固定するのは、**headless実行でもAPIレベルの統合確認を先に成立させる**という方針である。
- ここでいうAPIレベル統合確認には、native provider registration / fallback exposure / DXロジック再利用の確認を含むが、UXの完全再現は含めない。
- headless hostでは `xvfb-run` のような仮想ディスプレイ前提が欠けると、native/fallback比較以前にVSCode起動自体が成立しない。したがってarchitecture上のfirst triageは **(1) headless prerequisite充足確認 → (2) Extension Host起動可否 → (3) native/fallback境界の切り分け** の順とする。
- ここでの `xvfb-run` 欠落は **verification entry conditionの不足** を示すだけであり、provider/fallback仕様の適否を直接示す証拠としては扱わない。
- このheadless triage boundaryにより、受入条件1〜3の仕様確認と、受入条件4のE2E実行前提不足を別々に追跡できる。
- このfirst triage順により、環境起因の起動失敗とprovider/fallbackの仕様境界を混同しない。

## 7. Known risk isolation
- **headless VSCode 1.112** 系では、autocompleteのsheet候補取得が不安定になる既知リスクがある。
- このリスクは、Paste / D&Dのcanonical path / compatibility path / shared-logic boundaryとは独立したものとして扱う。
- したがって設計上は、autocompleteの不安定要因を理由にPaste / D&Dの責務境界、E2E対象範囲、delegated manual scopeへの委譲線を変更しない。
- 既知リスクの隔離方針は以下とする。
  - Paste / D&Dの受入判定はnative provider surface / fallback互換性 / ロジック再利用の確認で閉じる。
  - autocompleteのheadless不安定は、同一E2Eスイート上に存在しても **別トラックの品質リスク** として扱う。
  - known unstableは「自動E2E全体の信頼性監視対象」ではあるが、「Paste / D&Dのpass/failを決める入力」にはしない。
- 再現手順、観測ログ、暫定回避策などの運用詳細はdocumentation側へ委譲する。

## 8. Scope matrix
| Boundary | Automation scope | Delegated manual scope | Known risk / excluded concern |
|---|---|---|---|
| DXロジック本体 | 候補生成・診断判定・DataTransfer 解析結果・embed 生成ロジック再利用 | 実 UI 上の見え方 | headless 補完表示の非決定性 |
| VSCode統合層 | provider / command の公開、native provider 優先、fallback 互換経路、`extendMarkdownIt` export の存在 | host ごとの体感差・運用導線 | unsupported host ごとの UI 差分 |
| **Markdown Preview 描画** [ADR-0010 追加] | `extendMarkdownIt` 経由の HTML 構造（`<figure>`/`<table>`/mmi-* クラス/属性）・block 描画（no-`<p>`-wrap）・`env.currentDocument` パス解決 | 実プレビューの視覚確認・スクリーンショット取得・印刷/PDF 確認 | DOMPurify 版差分による属性生存の微細変動 |
| E2E検証レイヤ | Extension Host API から観測できる統合事実、native surface、fallback 成立、**Preview 中核描画の HTML 構造** | Preview の視覚・スクリーンショット、Problems / suggest widget の見た目確認 | OS イベント最終反映、autocomplete known unstable |
| Delegated manual scope | なし | OS ネイティブ event、Preview **視覚**（HTML 構造は automation 側）、Problems UI、補完 UX | architecture 境界の再定義 |

## 9. Directory mapping
- `03_Implement/src/dx/*`: DXロジック本体
- `03_Implement/src/extension.ts`: VSCode統合層
- `03_Implement/test/e2e/**`: E2E検証レイヤ
- `04_Documentation/vscode-e2e-testing.md`: delegated manual scopeと実行運用

## 10. issue-0010 acceptance mapping
issue-0010のacceptance criteria 1〜4とProgress Notesに残っている未完了論点は、architecture上では次の4類型へ正規化して読む。

| Concern bucket | What remains open on the document side | Architecture decision | Boundary section | Handoff / note |
|---|---|---|---|---|
| native canonical path | native provider surface を Paste / D&D の canonical path として固定し、受入条件 1 の追跡点を明示する | native paste/drop provider を Paste / D&D の正規入口として固定する | `4.1 Canonical path boundary`, `5.1 Automation scope` | manual E2E は UX 最終到達だけを補完する |
| fallback compatibility path | unsupported host でも fallback policy を acceptance criteria 3 として追跡できるようにする | command fallback を native 代替ではなく互換境界として維持する | `4.2 Compatibility path boundary`, `5.3 Verification boundary rule` | host capability 不足時でも受入条件 3 を追跡できる |
| xvfb-run prerequisite | headless 実行前提不足を provider/fallback 仕様失敗と混同しない | headless prerequisite 未充足は verification entry condition として扱う | `5.3 Verification boundary rule`, `6. Headless execution boundary` | automation blocked と manual continuation を混線させない |
| known unstable separation | autocomplete known unstable を Paste / D&D acceptance boundary から隔離する | `#` 補完不安定は Paste / D&D acceptance 境界から外す | `5.3 Verification boundary rule`, `7. Known risk isolation` | 同一 run で併発しても別トラックで記録する |

補足として、acceptance criteria 2のshared-logic reuseは上記4類型を横断する設計制約であり、native canonical pathとfallback compatibility pathの両方で `pasteDrop.ts` 再利用を守る前提条件として扱う。


## 11. issue-0010 criteria-to-boundary table
issue-0010のacceptance criteria 1〜4とProgress Notesを、architecture単体で追えるように1行単位で正規化する。ここでは **何を固定するか** だけを記述し、実行手順やhost別操作順は再定義しない。

| issue-0010 concern | Architectural proof point | Fixed in architecture | Explicitly delegated out of architecture |
|---|---|---|---|
| Acceptance 1: native provider surface から発火できること | native provider を canonical path として公開し、Extension Host API から呼び出し可能な構造であること | `4.1 Canonical path boundary`, `5.1 Automation scope` | OS event から editor edit までの最終 UX は manual scope / documentation |
| Acceptance 2: `pasteDrop.ts` 再利用・重複実装禁止 | native / fallback が単一の DataTransfer・embed 生成ロジックへ収束すること | `3.1 DXロジック本体`, `4.3 Shared-logic boundary` | 実装詳細や helper 配置の説明は implementation 側 |
| Acceptance 3: unsupported host での fallback 方針明示 | command fallback を compatibility path として残し、unsupported host を吸収すること | `3.2 VSCode統合層`, `4.2 Compatibility path boundary`, `5.3 Verification boundary rule` | host class ごとの first path / comparison path は runbook 側 |
| Acceptance 4: unit / E2E の双方で退行がないこと | architecture は Extension Host E2E が担う verification boundary を固定し、unit の詳細は持ち込まないこと | `3.3 E2E検証レイヤ`, `5.1 Automation scope`, `6. Headless execution boundary` | unit test の詳細、CLI 実行順、再試行手順は setup / runbook 側 |
| Progress note: native registration / shared parsing / fallback behavior を proof boundary にする | proof boundary を provider surface・shared logic・fallback compatibility に限定すること | `4.1`〜`4.3`, `5.1` | テストケース名や fixture 説明は implementation 側 |
| Progress note: `xvfb-run` 未導入時は環境起因 | `xvfb-run` 欠落を verification entry condition 未充足として扱うこと | `5.3 Verification boundary rule`, `6. Headless execution boundary` | 導入手順や OS 依存セットアップは developer setup 側 |
| Progress note: autocomplete `#` 補完不安定を分離 | Known unstable を Paste / D&D acceptance boundary から切り離すこと | `7. Known risk isolation` | 具体的な再現・観測・日次 triage は runbook 側 |

## 12. Keyword traceability audit
issue-0010の受入条件1〜4をarchitecture単体で追えることを確認するため、本書が固定すべきキーワードとその意味を次のように監査する。

| Keyword | Architecture meaning | Why it stays here | Why details stay elsewhere |
|---|---|---|---|
| `native` | Paste / D&D の canonical path を指す | 正規入口の定義は architecture 判断だから | 実観測の操作順・証跡採取は runbook |
| `fallback` | unsupported host 向け compatibility path を指す | 後方互換境界の有無は architecture 判断だから | host ごとの運用は runbook |
| `DataTransfer` | native / fallback が共有する解釈責務の代表語 | shared-logic boundary の核だから | payload 実例や fixture は implementation / test |
| `Paste / D&D` | canonical / compatibility の比較対象となる機能境界 | issue-0010 の受入条件に直結するから | 最終 UX 確認は manual documentation |
| `autocomplete` | Paste / D&D と切り離す known unstable の代表語 | acceptance boundary を汚染しないため | 個別 triage は runbook |
| `xvfb-run` | verification entry condition を示す headless prerequisite の代表語 | provider/fallback failure と分離する判断だから | インストール手順は developer setup |

## 13. issue-0010 acceptance trace summary
- Acceptance criteria 1「native provider surfaceから発火できること」には、`4.1 Canonical path boundary` と `5.1 Automation scope` が対応する。
- Acceptance criteria 2「既存 `pasteDrop.ts` を再利用し重複実装しないこと」には、`4.3 Shared-logic boundary` が対応する。
- Acceptance criteria 3「native providerが使えない環境でのfallback方針明示」には、`4.2 Compatibility path boundary` と `5.1 Automation scope` が対応する。
- Progress noteにある「native provider registration surface / shared parsing / fallback command behaviorをproof boundaryとする」整理は、`5.1 Automation scope` と `5.3 Verification boundary rule` に反映されている。
- Progress noteにある「`xvfb-run` 未導入時は環境起因でE2E未完了」との扱いは、`6. Headless execution boundary` にてverification entry conditionとして分離している。
- Progress noteにある「manual E2Eの比較順・failure triageはdocumentation側に保持する」整理は、`3.4 Delegated manual scope` と `14. Documentation handoff rule` に反映されている。
- Acceptance criteria 4「unit / E2Eの双方で退行がないこと」のうち、本architecture文書が固定するのは **Extension Host E2Eのverification boundary** までであり、unitの詳細や運用手順は実装層・documentation層の責務とする。
- 強化点として、acceptance criteria 4を『E2Eがどこまで退行検知を担い、どこから先をheadless entry condition / delegated manual scopeに分離するか』まで追跡可能にした。
- 以上により、architecture文書だけを読んでも、issue-0010のautomation boundary / delegated manual boundary / headless triage boundaryを追跡できる。

## 14. Documentation handoff rule
- このarchitecture文書で固定するもの。
  - 各層の責務境界
  - native paste/drop providerをcanonical pathとする方針
  - command fallbackをcompatibility pathとして残す方針
  - shared logicを単一仕様正本として維持する方針
  - issue-0010の完了判定に必要なverification boundaryの最小線
  - headless VSCode 1.112 autocomplete不安定要因を既知リスクとして分離管理する方針
- documentation側へ委譲するもの。
  - 実行コマンド
  - 環境構築手順
  - manual E2Eの詳細チェックリスト
  - failure triageと再現ログの取り方
  - 既知リスクに対する日次運用・暫定回避フロー
