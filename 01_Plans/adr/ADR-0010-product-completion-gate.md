# ADR-0010: プロダクト完成度ゲートと公開品質基準 (Product Completion Gate & Release-Worthiness)

- Status: Accepted
- Date: 2026-05-31
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers
- Scope: 製品完成度の定義、end-to-end検証ゲート、preview/print実証、配布の延期

## Context (背景と課題)
- Phase 1〜10で計画は完了状態（ADR 10 / issue 92 Done / pending 0）。unitも146件green。しかし「本質価値が実利用環境で達成されているか」を問い直すと、達成は実証されていない。
- 決定的事実: 本プロダクトのミッション（requirements §0「Markdownプレビュー上に外部データを動的インライン表示する」）の中核である `markdownMatrixPlugin` は、テスト専用コマンド内でしか使われておらず、VS Codeプレビューへ結線されていなかった（`extendMarkdownIt` / `markdown.markdownItPlugins` がリポジトリ全体で0件）。すなわちプロダクトとしての中核価値は、これまで一度も実利用者に届いていなかった。issue-0093で結線・unit検証したが、実ホストでの描画は未実証。
- 補強する状況証拠は次のとおりです。
  - `02_Architecture/vscode-extension-host-e2e.md` はPreview/Webview DOMの検証を「delegated manual scope」へ恒久退避しており、自動でも手動でも中核描画が実証された形跡がない。
  - チュートリアル等の「スクリーンショット」は実画面キャプチャではなく `.svg` の説明図であり、実描画の証跡ではない。
  - エンタープライズ出力（pageBreak/orientation/Smart FallbackのPDF再現）も実測の裏付けがない。
- 構造的な誤認: 本プロジェクトは「モジュールがunit-green」「release gateがgreen」「ガバナンスが自動化」をプロダクトの完成と同一視してきた。これらは必要だが、本質価値の達成（end-to-endで動き、出力品質が再現し、データを壊さない）を保証しない。

## Decision (決定事項)
配布より前に、本質価値の達成を完成度の基準として定義し、満たすまで公開しない。

1) 公開に足る品質ゲート (G1〜G4) を製品レベルのDefinition of Doneとする（requirements.md Phase 11に正本化）。
   - G1: 実VS Codeプレビューで `![[...]]` が正しく描画（サニタイズ生存・スタイル適用・キャッシュ・scroll sync）。
   - G2: 代表的SIer設計書サンプルでcaption/相互参照/pageBreak/orientation/Smart FallbackがPDFまで含め再現（対応PDF生成器を1つ以上明示）。
   - G3: 実データで原本非改変（read-only）を保証として確認。
   - G4: 動かない条件を実測ベースで文書化（正直な適用範囲）。
2) end-to-end検証を完成判定の正本とする。`issue Done` / `release gate green` だけでは本ゲートを充足しない。実ホストe2e（可能な範囲で自動化）＋ 実際に実行された manual-e2e runbookのエビデンスで判定する。
3) 「preview = manual scopeへ恒久退避」という旧architecture判断を見直す。中核描画は「検証対象外」にできない。自動で取れる範囲（host上のHTML生存・構造・主要クラス/属性）はautomationへ引き上げ、視覚微調整のみmanualに残す。`02_Architecture` を本方針で更新する。
4) 描画方式の実現性は確認済み: VS Codeのmarkdown engineは `html: true` で生HTMLを通し、サニタイズはDOMPurify既定（`<figure>/<figcaption>/<table>/<pre>/<code>`、`class`/`id`/`data-*` を許可）。よって注入HTMLは概ね生存する見込みであり、方式変更は不要。ただしblock要素をinline (`html_inline`) として段落内に注入している点は出力構造の健全性（`<p>` 内blockネスト）として是正対象とする。
5) 配布・採用拡大は本ゲート通過後の別フェーズへ延期する。Marketplaceパッケージング/公開、コミュニティ整備、供給網運用は、完成度ゲート未通過の段階では着手しない（中途半端なリリースを避ける）。
6) 上流から順に是正する: 要件（Phase 11 / 本ADR）→ 設計（02_Architecture更新）→ 実装/テスト（下記issue群）→ 文書整合、の順で進め、各段でend-to-endエビデンスを残す。

### 是正シーケンス（重要度・依存順）
1. preview結線（`issue-0093`・Done）
2. previewスタイル `markdown.previewStyles`（`issue-0094`） … G1/G2
3. blockレベル描画・出力構造の健全化（段落内blockネストの解消） … G1/G2
4. 実ホストe2eによる描画生存の実証（`issue-0097`） … G1
5. PDF/印刷でのエンタープライズ出力実証（`issue-0098`） … G2
6. 実SIerデータfixture・read-only保証・正直な制約の文書化 … G3/G4
7. （ゲート通過後）配布・採用拡大フェーズ（`issue-0095`/`issue-0096` は本ゲート通過までDeferred）

## Consequences (結果と影響)
- **Good:** 「リリース＝本質価値が実証済み」を意味するようになり、中途半端な公開を防げる。蓄積した内部品質・ガバナンスが、初めて「実際に動く成果物」を保護する投資として回収される。
- **Good:** 正直な適用範囲（G4）が信頼を生み、評価者の意思決定を助ける。
- **Bad:** end-to-end / manual-e2e / PDF 検証は GUI・実ホストを要し工数が大きい。完成判定のリードタイムが延びる。
- **Bad:** 配布が後ろ倒しになり、外形的な「公開済み」状態の獲得は遅れる。
- **Trade-off 受容理由:** 「動かない／実証されていない物を配る」損失（信頼毀損・手戻り）の方が、公開の遅れより大きい。本質価値の実証を最優先する。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` (Phase 11: 公開に足る品質ゲートG1〜G4)
- Related issues: `issue-0093`(preview結線・Done) / `issue-0094`(preview styles) / `issue-0097`(e2e描画実証) / `issue-0098`(PDF実証) / `issue-0095`・`issue-0096`(配布系・Deferred)
- Architecture to update: `02_Architecture/vscode-extension-host-e2e.md`（previewをautomation scopeへ引き上げ）
- Upstream contract evidence: VS Code `markdownEngine.ts` の `RenderEnv.currentDocument: vscode.Uri` / `html:true` / DOMPurify既定許可

## 議事録 (AI読込不要)
### Issue Definition
- 「OSSを社会に出すに足る」とは何か。issue完了数やgate greenではなく、本質価値が実利用環境で達成されている状態をどう定義し、どこから是正するか。

### Virtual Debate (Round 1)
- Product/UX Lead: 中核はプレビュー注入。これまで結線すらされておらず、価値は誰にも届いていなかった。完成度の第一基準は「実プレビューで本当に描画される（G1）」。
- QA/Delivery Lead: unit-greenはlogicの正しさで、製品の正しさではない。実ホストe2eとPDF実証、原本非改変の保証を完成判定の正本にすべき。manual-e2eは「実行された証跡」を要件化する。
- Architecture Lead: 描画方式は `html:true`+DOMPurify既定で実現可能と確認済み。問題は方式でなく未結線・未実証・未スタイル。previewをmanual scopeに恒久退避した旧判断が、中核未検証を許した。これを是正しautomationへ引き上げる。

### Virtual Debate (Round 2)
- Architecture Lead: blockをinline注入している構造（`<p>` 内block）は出力品質に効く。是正対象に含める。
- Product/UX Lead: 配布は完成後。中途半端な公開は信頼を損なう。Marketplace/コミュニティ/供給網は本ゲート通過後の別フェーズへ延期で合意。
- QA/Delivery Lead: 上流から順に（要件→設計→実装/テスト→文書）回し、各段でend-to-endエビデンスを残す。release gateに「preview/print e2eの実行証跡」を将来的に接続する余地を残す。

### Synthesis & Decision
- 3ロール合意: 公開に足る品質をG1〜G4で定義し、end-to-endエビデンスを完成判定の正本とする。配布は延期。previewをautomation scopeへ引き上げ。是正は上流から順に。
- 本決定は要件根幹の破壊ではなく、要件が暗黙に欠いていた「製品完成の定義」を明示する補完であるため、ADR + requirements更新で実行可能（人間承認待ち不要）。配布に伴う外部アカウント/資格情報の操作のみ、後続フェーズでhuman gateとする。
