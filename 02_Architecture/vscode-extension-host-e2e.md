# VSCode Extension Host E2E Test Architecture

## 1. Goal
- この文書は、Phase 5 の VSCode Extension Host E2E における**設計上の境界線**を固定する。
- 対象は、DX ロジック本体・VSCode 統合層・E2E 検証レイヤ・manual E2E 補完領域の責務分離である。
- 特に issue-0010 の受入条件に対し、**native provider surface / fallback 方針 / known unstable 分離**を architecture 上の責務として明文化する。
- 実行手順、チェックリスト、再現方法、失敗時オペレーションの詳細は `04_Documentation/vscode-e2e-testing.md` に委譲する。

## 2. Architecture decision summary
1. **自動 E2E の主対象は Extension Host API レベルの統合確認**とする。
2. **native paste/drop provider** を Paste / D&D の canonical path とし、通常 host ではこの入口を優先保証対象に含める。
3. host capability や API 制約で native provider を使えない場合に備え、**command fallback** を compatibility path として残し、unsupported host を吸収する。
4. native provider と command fallback は、同一の DX ロジックへ収束させ、解析仕様を二重化しない。
5. OS ネイティブイベントから最終的に editor edit が反映される UX 確認は、設計上 **delegated manual scope** の責務とする。
6. headless VSCode 1.112 系の autocomplete 不安定要因は、Paste / D&D 受入判定から切り離した **known risk** として扱う。
7. architecture 文書は「何をどこまで保証対象に含めるか」を固定し、具体的な運用手順は documentation に委譲する。

## 3. Layered responsibility boundaries

### 3.1 DXロジック本体
- 対象: `03_Implement/src/dx/*`
- 責務:
  - autocomplete の候補生成規則
  - diagnostics の判定規則
  - clipboard / dropped file / DataTransfer の解析規則
  - native provider / command fallback の双方から再利用される embed 生成ロジック
- 非責務:
  - VSCode API への登録
  - host capability 判定
  - 実エディタ上での UX 挙動保証
  - fallback を公開するかどうかの運用判断
- 設計原則:
  - 仕様正本はロジック側に集約し、native provider と command fallback の双方で再利用する。
  - 解析ロジックを二重実装しない。
  - issue-0010 の受入条件における「既存 `pasteDrop.ts` 再利用」は本層の関心として守る。

### 3.2 VSCode統合層
- 対象: `03_Implement/src/extension.ts`
- 責務:
  - Completion Provider / Diagnostics / native provider の登録
  - host capability に応じた feature exposure
  - unsupported host 向け command fallback の公開
  - native provider を canonical path、command fallback を compatibility path として露出させる境界管理
- 非責務:
  - clipboard/filepath 解釈ロジックの再定義
  - E2E テストケース固有の判定
  - manual E2E の運用手順定義
- 設計原則:
  - 統合層は「VSCode にどう接続するか」を担い、「何を返すか」の仕様は DX ロジック本体へ委譲する。
  - native provider が利用可能な host ではそれを優先し、fallback は互換性維持のためにのみ公開する。
  - fallback は native provider の代替実装ではなく、unsupported host を吸収する互換境界として扱う。

### 3.3 E2E検証レイヤ
- 対象: `03_Implement/test/e2e/**`
- 責務:
  - 実際の VSCode Engine 上で、公開 surface の統合結果を検証する。
  - render / completion / diagnostics / native provider adapter / command fallback を API レベルで確認する。
  - Paste / D&D では、native provider が正規入口として登録され、同一解析ロジックへ委譲され、unsupported host では command fallback が互換経路として残ることを確認する。
  - issue-0010 の完了判定に必要な最小限の verification boundary を自動検証対象として保持する。
- 非責務:
  - Preview DOM の視覚保証
  - Problems パネル UI の視認性保証
  - OS ネイティブ paste / drop event の最終挙動保証
  - autocomplete 不安定時の運用判断や回避策策定
- 設計原則:
  - E2E は VSCode API から観測できる事実のみを automation scope に含める。
  - native provider surface の存在確認と fallback 互換性確認を優先し、UI/OS 依存が強い経路は delegated manual scope に切り分ける。
  - 既知の非決定的要因は boundary 外として隔離し、Paste / D&D 受入判定と混線させない。

### 3.4 Delegated manual scope
- 対象: `04_Documentation/vscode-e2e-testing.md` に記述される運用・確認手順
- 責務:
  - Preview / Webview DOM の見た目確認
  - Problems パネル UI の確認
  - suggest widget の操作感確認
  - OS ネイティブ paste / drag-and-drop から editor edit が反映される最終経路の確認
  - native provider が editor UX として自然に機能するか、および fallback 導線が必要な host で運用上破綻しないかの最終確認
- 非責務:
  - DX ロジックや統合層の仕様決定
  - 自動 E2E の代替となる詳細実装説明
  - architecture 境界そのものの再定義
- 設計原則:
  - manual E2E は、自動 E2E で保証しない UX/OS 依存領域の補完に限定する。
  - 運用上の詳細チェックリストは documentation に保持し、architecture 文書へ逆流させない。

## 4. Paste / D&D boundary contract

### 4.1 Canonical path boundary
- Paste / D&D の正規入口は **native paste/drop provider** である。
- この surface を canonical path と固定する理由は、VSCode が提供する native API surface に乗ることが editor 統合として最も自然であり、issue-0010 の「native provider surface から発火できること」を architecture 上の基準にできるためである。
- ここでいう「発火できること」は、OS イベントの完全再現ではなく、**統合層から native provider surface が公開され、Extension Host から呼び出し可能な構造であること**を指す。

### 4.2 Compatibility path boundary
- host に native provider API が無い、または安定して利用できない場合がある。
- そのため **command fallback** を残し、native provider と同じ解析ロジックを通して embed 文字列を生成する。
- command fallback は暫定実装ではなく、**unsupported host を支える compatibility path** として architecture に含める。
- issue-0010 における「fallback 方針が明示されること」は、native provider を置き換えることではなく、host capability 不足時の互換入口を維持する方針を明示することを指す。

### 4.3 Shared-logic boundary
- native provider と command fallback は、入口は分かれていても **DataTransfer / dropped file 解析と embed 生成の仕様正本を共有**する。
- したがって architecture 上の境界は「surface は複数でも、解釈ロジックは単一」である。
- この shared logic boundary では、DX ロジック本体が唯一の解釈責務を持ち、VSCode 統合層と E2E 検証レイヤはその仕様正本を書き換えない。
- issue-0010 における「既存 `pasteDrop.ts` を再利用し、重複実装しないこと」は、この shared-logic boundary に対応する。

## 5. Verification boundary

### 5.1 Automation scope
- 自動 E2E が保証するのは以下までとする。
  - native provider を登録できる host capability があること
  - provider が native surface 経由で呼び出されうる統合形になっていること
  - provider が再利用する DataTransfer 解析ロジックが期待どおりであること
  - unsupported host でも command fallback が compatibility path として成立すること
  - native provider と command fallback が別々の解析仕様へ分岐していないこと
- したがって issue-0010 の受入条件における『native provider surface から発火できること』『既存ロジックを再利用すること』『fallback 方針が明示されること』は、自動 E2E の設計対象に含まれる。

### 5.2 Delegated manual scope
- 自動 E2E が保証しないもの:
  - OS ネイティブ event から editor edit が適用される最終挙動
  - 操作感や UI 上の導線
  - host ごとのメニュー導線や権限差分を含む運用確認
  - Preview / Problems / suggest widget の視覚確認
- これらは documentation に記述される manual E2E へ委譲する。

### 5.3 Verification boundary rule
- Paste / D&D の受入判定は、canonical path の公開、compatibility path の維持、shared logic の単一性までで閉じる。
- autocomplete の安定性、visual UI、OS レベル最終挙動は、同一テストスイートに存在しても Paste / D&D の acceptance boundary に流入させない。
- これにより、issue-0010 の automation boundary と delegated manual boundary を相互に独立した設計判断として維持する。

### 5.4 Guarantee / delegation rule
- architecture 文書が保証するのは、**canonical path・compatibility path・shared logic・known risk isolation** の境界定義までである。
- architecture 文書は、native provider が優先入口であり、fallback が互換入口であり、両者が同一ロジックへ収束し、autocomplete known unstable が Paste / D&D acceptance boundary に混入しないことを保証対象として固定する。
- 一方で、各 host でどの UI 操作を行うか、どの順に manual scope を確認するか、失敗時にどう切り分けるかは documentation 側へ委譲する。
- したがって automation scope と manual scope の境界は architecture が決めるが、運用手順そのものは architecture の責務に含めない。

## 6. Headless execution boundary
- Extension Host E2E は、Docker / CI の headless 環境でも VSCode Engine を起動できる構成を前提とする。
- ただし headless 実行の成立は「E2E を実行可能にする環境前提」であり、手順や依存パッケージの詳細は運用文書へ委譲する。
- architecture として固定するのは、**headless 実行でも API レベルの統合確認を先に成立させる**という方針である。
- ここでいう API レベル統合確認には、native provider registration / fallback exposure / DX ロジック再利用の確認を含むが、UX の完全再現は含めない。

## 7. Known risk isolation
- **headless VSCode 1.112** 系では、autocomplete の sheet 候補取得が不安定になる既知リスクがある。
- このリスクは、Paste / D&D の canonical path / compatibility path / shared-logic boundary とは独立したものとして扱う。
- したがって設計上は、autocomplete の不安定要因を理由に Paste / D&D の責務境界、E2E 対象範囲、delegated manual scope への委譲線を変更しない。
- 既知リスクの隔離方針は以下とする。
  - Paste / D&D の受入判定は native provider surface / fallback 互換性 / ロジック再利用の確認で閉じる。
  - autocomplete の headless 不安定は、同一 E2E スイート上に存在しても **別トラックの品質リスク** として扱う。
  - known unstable は「自動 E2E 全体の信頼性監視対象」ではあるが、「Paste / D&D の pass/fail を決める入力」にはしない。
- 再現手順、観測ログ、暫定回避策などの運用詳細は documentation 側へ委譲する。

## 8. Scope matrix
| Boundary | Automation scope | Delegated manual scope | Known risk / excluded concern |
|---|---|---|---|
| DXロジック本体 | 候補生成・診断判定・DataTransfer 解析結果・embed 生成ロジック再利用 | 実 UI 上の見え方 | headless 補完表示の非決定性 |
| VSCode統合層 | provider / command の公開、native provider 優先、fallback 互換経路 | host ごとの体感差・運用導線 | unsupported host ごとの UI 差分 |
| E2E検証レイヤ | Extension Host API から観測できる統合事実、native surface、fallback 成立 | Preview / Problems / suggest widget の視覚確認 | OS イベント最終反映、autocomplete known unstable |
| Delegated manual scope | なし | OS ネイティブ event、Preview DOM、Problems UI、補完 UX | architecture 境界の再定義 |

## 9. Directory mapping
- `03_Implement/src/dx/*`: DXロジック本体
- `03_Implement/src/extension.ts`: VSCode統合層
- `03_Implement/test/e2e/**`: E2E検証レイヤ
- `04_Documentation/vscode-e2e-testing.md`: delegated manual scope と実行運用

## 10. issue-0010 acceptance trace summary
- Acceptance criteria 1「native provider surface から発火できること」には、`4.1 Canonical path boundary` と `5.1 Automation scope` が対応する。
- Acceptance criteria 2「既存 `pasteDrop.ts` を再利用し重複実装しないこと」には、`4.3 Shared-logic boundary` が対応する。
- Acceptance criteria 3「native provider が使えない環境での fallback 方針明示」には、`4.2 Compatibility path boundary` と `5.1 Automation scope` が対応する。
- Acceptance criteria 4「unit / E2E の双方で退行がないこと」のうち、本 architecture 文書が固定するのは **Extension Host E2E の verification boundary** までであり、unit の詳細や運用手順は実装層・documentation 層の責務とする。
- 以上により、architecture 文書だけを読んでも、issue-0010 の automation boundary / delegated manual boundary / known unstable 分離方針を追跡できる。

## 11. Documentation handoff rule
- この architecture 文書で固定するもの:
  - 各層の責務境界
  - native paste/drop provider を canonical path とする方針
  - command fallback を compatibility path として残す方針
  - shared logic を単一仕様正本として維持する方針
  - issue-0010 の完了判定に必要な verification boundary の最小線
  - headless VSCode 1.112 autocomplete 不安定要因を既知リスクとして分離管理する方針
- documentation 側へ委譲するもの:
  - 実行コマンド
  - 環境構築手順
  - manual E2E の詳細チェックリスト
  - failure triage と再現ログの取り方
  - 既知リスクに対する日次運用・暫定回避フロー
