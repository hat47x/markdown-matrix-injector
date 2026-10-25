# Issue: 納品マニフェスト出力コマンドの接続と到達可能性の改善

この文書は当時のIssue記録です。原記録にはコマンド接続とサンプルCSV出力の実績が記載されています。これらは当時の実行記録であり、現行実装の独立した再検証ではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: 03_Implement/src/manifest/collectDeliveryManifest.ts, 03_Implement/src/extension.ts, 03_Implement/package.json, 03_Implement/test/collectDeliveryManifest.test.ts
- Expected verification level: unit + end-to-end (sample実行)

## Traceability
- Related Backlog/Phase: requirements.md Phase 4「Generate Delivery Manifestコマンド」/ Phase 11完成度ゲート
- Related ADR/Spec: ADR-0010 (Product Completion Gate)
- 同種ギャップ: issue-0093（preview未結線）

## 背景
要件Phase 4は「`Generate Delivery Manifest` コマンドで、別紙扱いとなったファイル群を納品用チェックリスト（CSV）として出力する」と規定する。
しかし `generateDeliveryManifest()` は純関数として存在するだけで、**VS Codeコマンドとして登録されておらず**（package.jsonにもextension.tsにも無し）、
利用者から到達不能だった（issue-0093のプレビュー未結線と同種の「実装済みだが未配線」ギャップ）。さらに、ドキュメントから別紙対象を抽出して
マニフェスト行を組み立てる収集ロジック自体が存在しなかった。

## 当時の実行計画
### 解決方針（当時の提案）（実施済み）
1. `src/manifest/collectDeliveryManifest.ts` を新設（vscode非依存・テスト可能）。Markdownを走査し、Smart Fallbackで
   カード（別紙）になる埋め込みのみを `DeliveryManifestRecord[]` に収集。reasonはSmart Fallbackの判定理由を日本語ラベル化。
   リンク切れ・シート不在はDiagnostics対象として除外。
2. `src/core/smartFallback.ts` に `getImmediateSmartFallbackDecision` / `getSmartFallbackDecisionAfterLoad` をexport
   （既存 `shouldRenderAsCard*` を単一ロジックへ統合）。
3. `extension.ts` に `markdownMatrixInjector.generateDeliveryManifest` を `registerTextEditorCommand` で配線。
   別紙対象をCSV化し `<filename>.delivery-manifest.csv` を同フォルダへ出力。0件時は通知のみ、未保存時は保存を促す。
4. `package.json` にcommand（title: `MMI: Generate Delivery Manifest`）とactivationEventを追加。

### 受入条件（Acceptance criteria）
- [x] `markdownMatrixInjector.generateDeliveryManifest` がpackage.jsonとextension.tsに登録されている。
- [x] 別紙（mode=card / 列10超 / セル500超 / シート未指定）の埋め込みのみがCSV化される。
- [x] リンク切れ・シート不在の埋め込みは除外される。
- [x] unit test 9件追加（`collectDeliveryManifest.test.ts`）、全176 pass。
- [x] 代表SIerサンプルでend-to-end実行しCSV出力を確認（`design-doc-sample.delivery-manifest.csv`、別紙1件）。

### 当時の検証計画（Validation plan）（実績）
- `npm run build` / `npm test` exit 0（176 pass）。
- `extensionIntegration.test.ts` のcommand/activationEvent完全一致アサーションを更新。
- サンプル実行: `04_Documentation/samples/sier-design/design-doc-sample.delivery-manifest.csv` 生成（reason=mode=card指定）。
