# Markdown Matrix Injector Overview

## Publication
- 利用者向けの入口: [チュートリアル](tutorial.md) / [利用マニュアル](user-manual.md) / [実務サンプル](samples/practical/README.md)
- Canonical source: `04_Documentation/overview.md`

## Target reader
- **導入判断者（マネージャー / テックリード）**: Word中心運用からMarkdown中心運用へ移行する投資判断を行う人
- **PoC担当（評価・検証担当エンジニア）**: 30分以内に「埋め込み成功」を再現し、採用可否を見極める人
- **運用担当（文書保守・納品担当）**: 正本データと納品文書の整合を日常運用で維持する人
- **AIエージェント開発者 / 導入者**: エージェントに文書を書かせる際、正本との乖離（ドリフト）を構造的に防ぎたい人

## Prerequisites
- Markdownを日常的に編集していること
- 元データとしてExcel / CSV / XMLを保持していること
- 「文書に表を貼り付ける」のではなく「正本データを必要な文脈だけ見せたい」という課題を持っていること
- 追加評価を行う場合、`tutorial.md` と `reference.md` を参照できること

## Expected result
この文書を読むと、次の3点を短時間で説明・判断できるようになります。
1. Markdown Matrix Injectorがどの課題を解き、どの読者にどんな価値を返すか。
2. 導入判断者・PoC担当・運用担当それぞれの「意思決定ポイント」（投資判断 / 採用可否 / 継続運用可否）。
3. 次に読むべき文書（Tutorial / Scenario / Reference）と、導入初期に把握すべき制約。

## Scope fixed from issue-0016 (overview対象)
- 本書で充足する受入条件は 「overview.mdに対象ユーザー別の価値（導入判断者 / PoC担当 / 運用担当）を明記すること」。
- TutorialやREADMEの受入条件は別ストリーム対象として扱い、本書では導線の参照のみを提供します。

## What this tool is
Markdown Matrix Injectorは、Excel / CSV / XMLを Single Source of Truth のまま保持しつつ、テキスト文書から必要な断面だけを読み取り専用で参照するための公開規約（MMI Notation）と、その参照実装（VS Code拡張）です（決定正本: ADR-0012）。

本プロジェクトが重視するのは次の4点です。
1. **正本を壊さないこと（恒久規範）**: 参照経路からは元データを改変できません（Read-only MUST）。エージェントが何でも編集できる時代の安全装置です。
2. **コピーではなく参照**: 表の貼り付け（二重管理）を宣言的参照へ置き換え、正本と文書の乖離を構造的に防ぎます。
3. **Markdownの弱点を補うこと**: テーブルやマトリクスが多い設計文書でも、Markdownを中心に据えたまま運用できます。
4. **納品品質まで見据えること**: Smart Fallbackや印刷制御により、巨大表やPDF出力時の崩れを扱いやすくします（実PDFで再現実証済み）。

## Reader-specific value
本セクションは、導入判断者 / PoC担当 / 運用担当 / AIエージェント開発者の4ロールそれぞれに対し、意思決定で使える価値訴求を固定するための要約です。

### 導入判断者の価値
- 正本保護（read-only）と印刷要件対応（Smart Fallback / `pageBreak` / `orientation`）を同時に評価でき、導入リスクを早期に見積もれます。
- `Overview -> Tutorial -> Scenario -> Reference` の導線で、組織展開前に必要な説明責任の根拠を揃えられます。
- **意思決定で得る成果**: 「Word代替としての導入に足るか」を、セキュア運用（正本保護）と納品品質（印刷制御）の両軸で判断できます。

### PoC担当の価値
- `![[...]]` 記法を起点に、`columns` / `grep` / `header` など最小パラメータで30分以内の「最初の成功」を再現できます。
- 失敗時も関連文書へ即遷移できるため、検証ログを残しながら採用判定を進めやすくなります。
- **意思決定で得る成果**: 「このチームで再現可能か」を、短時間で成功判定できる導線とトラブル初動の明確化で判断できます。

### 運用担当の価値
- 文書へ表を再貼り付けせず、正本データ参照に統一することで、改訂時の差分管理と整合確認（正本との突合）を軽量化できます。
- 巨大表をカード化する運用により、日常編集と納品体裁（印刷）を両立できます。
- **意思決定で得る成果**: 「運用を回し続けられるか」を、日常更新コストと納品時品質の両立可否で判断できます。

### AI エージェント開発者 / 導入者の価値
- エージェントに設計書を書かせる際、表をコピーさせず参照を挿入させる規約として使えます。参照はDiagnostics（`MMI_FILE_NOT_FOUND` 等の安定コード）で機械検証でき、生成文書のリンク健全性を自動チェックに組み込めます。
- query-evidence出力は「エージェントが書いた文書の記載が正本と一致しているか」を検証するためのground truthとして機能します。
- 記法は宣言的な断面参照のため、巨大な正本ファイルをコンテキストウィンドウへ展開せずに扱えます（コンテキスト経済）。
- **意思決定で得る成果**: 「agenticな文書生成を導入しても正本の完全性と文書の整合を守れるか」を、構造的read-onlyと機械検証可能性の2点で判断できます。

## Core capabilities at a glance
- `![[...]]` 記法でCSV / XLSX / XML Spreadsheet 2003を埋め込む
- `columns`, `transpose`, `grep`, `header` などで必要な範囲だけ切り出す
- `caption`, `id`, `pageBreak`, `orientation` で印刷や相互参照を補助する
- 巨大表やファイル全体参照はSmart Fallbackでカード表示へ縮退する
- Autocomplete / Diagnostics / Paste & D&Dにより記法入力を支援する

## Related docs
- **Adoption fast path**: `Overview -> Tutorial -> Scenario -> Reference`
- 最初に試す: `04_Documentation/tutorial.md`
- 業務シナリオを見る: `04_Documentation/scenario-sier-design-docs.md`
- 詳細仕様を引く: `04_Documentation/reference.md`

## Known limitations
- **プレビュー描画（G1）**: HTML構造・クラス・属性は自動テスト（unit 167件）で実証済み。実VS Codeプレビューの視覚スクリーンショットはGUI環境でのmanual-e2eで確認してください（`04_Documentation/vscode-e2e-testing.md` のChecklist F参照）。
- **PDF/印刷（G2）**: `pageBreak` / `orientation` のPDFへの反映は生成器に依存します。今回確認した経路はMMIで展開済みのHTMLからWeasyPrint 69.0への変換です。手順は [利用マニュアル](user-manual.md#pdfを作る) を参照してください。Markdown PDF拡張からの直接出力は未検証です。
- **XML**: XML Spreadsheet 2003のみ対応。汎用XMLはエラー表示になります。
- 実機UIの最終確認にはhost環境やVSCodeバージョン差の影響があります。
- 本書は `overview.md` 単体の価値訴求を優先しており、操作手順の詳細は `tutorial.md` を参照してください。

## 視覚補助素材（比較表）
導入判断者が「どの文書から何を判断するか」を1分で把握できるよう、導線と判断目的を比較表で固定します。

| 文書 | 主な目的 | 典型読者 | この文書で判断すること |
|---|---|---|---|
| Overview | 価値と導線の把握 | 導入判断者 / PoC担当 / 運用担当 | 採用検討を進める価値があるか |
| Tutorial | 30分以内の初回成功再現 | PoC担当 | まず動かせるか、失敗時に復帰できるか |
| Scenario | 業務導入時の期待効果比較 | 導入判断者 / 運用担当 | 自組織で運用可能か |
| Reference | 記法・制約・一次対応の参照 | 実装/運用担当 | 問題時にどこを確認するか |

## FAQ（Overview）
### Q1. この文書だけで導入可否を決められますか？
A1. いいえ。Overviewは「価値」と「導線」の判定入口です。最終判断はTutorialの再現性とScenarioの運用適合を確認して行います。

### Q2. Word 代替の観点で最初に見るべき項目は何ですか？
A2. 正本保護（read-only）、巨大表対応（Smart Fallback）、印刷制御（`pageBreak` / `orientation`）の3点を優先して確認してください。

### Q3. どの読者がどの文書を先に読むべきですか？
A3. 原則は全員 `Overview -> Tutorial -> Scenario -> Reference` です。時間が限られる場合でもOverviewの導線確認後にTutorialへ進むことを推奨します。

## スクリーンショット（通常埋め込み）
通常の埋め込み表示イメージです。PoC初動時に「テーブルとして表示される状態」の認識合わせに使用します。

![通常埋め込みプレビュー](./samples/screenshots/phase6-normal-embed-preview.svg)
