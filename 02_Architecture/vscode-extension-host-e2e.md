# VSCode Extension Host E2E Test Architecture

## 1. Goal
- この文書は、Phase 5 の VSCode Extension Host E2E における**設計上の境界線**を固定する。
- 対象は、DX ロジック本体・VSCode 統合層・E2E 検証レイヤ・manual E2E 補完領域の責務分離である。
- 実行手順、チェックリスト、再現方法、失敗時オペレーションの詳細は `04_Documentation/vscode-e2e-testing.md` に委譲する。

## 2. Architecture decision summary
1. **自動 E2E の主対象は Extension Host API レベルの統合確認**とする。
2. **native paste/drop provider** を Paste / D&D の正規入口とする。
3. host capability や API 制約で native provider を使えない場合に備え、**command fallback** を互換入口として残す。
4. OS ネイティブイベントから最終的に editor edit が反映される UX 確認は、設計上 **manual E2E 補完領域**の責務とする。
5. headless VSCode 1.112 系の autocomplete 不安定要因は、Paste / D&D 経路と分離して扱う既知リスクとして記録する。

## 3. Layered responsibility boundaries

### 3.1 DXロジック本体
- 対象: `03_Implement/src/dx/*`
- 責務:
  - autocomplete の候補生成規則
  - diagnostics の判定規則
  - clipboard / dropped file / DataTransfer の解析規則
- 非責務:
  - VSCode API への登録
  - host capability 判定
  - 実エディタ上での UX 挙動保証
- 設計原則:
  - 仕様正本はロジック側に集約し、native provider と command fallback の双方で再利用する。
  - 解析ロジックを二重実装しない。

### 3.2 VSCode統合層
- 対象: `03_Implement/src/extension.ts`
- 責務:
  - Completion Provider / Diagnostics / native provider の登録
  - host capability に応じた feature exposure
  - native provider 非対応 host 向け command fallback の公開
- 非責務:
  - clipboard/filepath 解釈ロジックの再定義
  - E2E テストケース固有の判定
- 設計原則:
  - 統合層は「VSCode にどう接続するか」を担い、「何を返すか」の仕様は DX ロジック本体へ委譲する。

### 3.3 E2E検証レイヤ
- 対象: `03_Implement/test/e2e/**`
- 責務:
  - 実際の VSCode Engine 上で、公開 surface の統合結果を検証する。
  - render / completion / diagnostics / native provider adapter / command fallback を API レベルで確認する。
- 非責務:
  - Preview DOM の視覚保証
  - Problems パネル UI の視認性保証
  - OS ネイティブ paste / drop event の最終挙動保証
- 設計原則:
  - E2E は VSCode API から観測できる事実のみを自動化対象にする。
  - UI/OS 依存が強い経路は manual E2E に切り分ける。

### 3.4 manual E2E 補完領域
- 対象: `04_Documentation/vscode-e2e-testing.md` に記述される運用・確認手順
- 責務:
  - Preview / Webview DOM の見た目確認
  - Problems パネル UI の確認
  - suggest widget の操作感確認
  - OS ネイティブ paste / drag-and-drop から editor edit が反映される最終経路の確認
- 非責務:
  - DX ロジックや統合層の仕様決定
  - 自動 E2E の代替となる詳細実装説明
- 設計原則:
  - manual E2E は、自動 E2E で保証しない UX/OS 依存領域の補完に限定する。

## 4. Paste / D&D architecture boundary

### 4.1 Canonical path
- Paste / D&D の正規入口は **native paste/drop provider** である。
- これは VSCode が提供する native API surface に乗ることで、将来の editor 統合を最も自然に扱うための設計判断である。

### 4.2 Compatibility path
- 一方で、host に native provider API が無い、または安定して利用できない場合がある。
- そのため **command fallback** を残し、native provider と同じ解析ロジックを通して embed 文字列を生成する。
- command fallback は暫定実装ではなく、**非対応 host を支える互換境界**として architecture に含める。

### 4.3 Verification boundary
- 自動 E2E が保証するのは以下までとする。
  - native provider を登録できる host capability があること
  - provider が再利用する DataTransfer 解析ロジックが期待どおりであること
  - native provider 非対応 host でも command fallback が成立すること
- 自動 E2E が保証しないもの:
  - OS ネイティブ event から editor edit が適用される最終挙動
  - 操作感や UI 上の導線
- これらは manual E2E 補完領域へ委譲する。

## 5. Headless execution boundary
- Extension Host E2E は、Docker / CI の headless 環境でも VSCode Engine を起動できる構成を前提とする。
- ただし headless 実行の成立は「E2E を実行可能にする環境前提」であり、手順や依存パッケージの詳細は運用文書へ委譲する。
- architecture として固定するのは、**headless 実行でも API レベルの統合確認を先に成立させる**という方針である。

## 6. Known architectural risk
- **headless VSCode 1.112** 系では、autocomplete の sheet 候補取得が不安定になる既知リスクがある。
- このリスクは、現時点では Paste / D&D の native provider / command fallback 境界とは独立したものとして扱う。
- したがって設計上は、autocomplete の不安定要因を理由に Paste / D&D の責務境界を崩さない。
- 再現手順、観測ログ、暫定回避策などの運用詳細は documentation 側へ委譲する。

## 7. Directory mapping
- `03_Implement/src/dx/*`: DXロジック本体
- `03_Implement/src/extension.ts`: VSCode統合層
- `03_Implement/test/e2e/**`: E2E検証レイヤ
- `04_Documentation/vscode-e2e-testing.md`: manual E2E 補完領域と実行運用

## 8. Verification matrix
| Boundary | Automated scope | Delegated scope |
|---|---|---|
| DXロジック本体 | 候補生成・診断判定・DataTransfer 解析結果 | 実 UI 上の見え方 |
| VSCode統合層 | provider / command の公開と統合結果 | host ごとの体感差 |
| E2E検証レイヤ | Extension Host API から観測できる統合事実 | Preview / Problems / suggest widget の視覚確認 |
| manual E2E 補完領域 | なし | OS ネイティブ event、Preview DOM、Problems UI、補完 UX |

## 9. Documentation handoff rule
- この architecture 文書で固定するもの:
  - 各層の責務境界
  - native paste/drop provider を正規入口とする方針
  - command fallback を互換境界として残す方針
  - headless VSCode 1.112 autocomplete 不安定要因を既知リスクとして分離管理する方針
- documentation 側へ委譲するもの:
  - 実行コマンド
  - 環境構築手順
  - manual E2E の詳細チェックリスト
  - failure triage と再現ログの取り方
