# Markdown Matrix Injector (MMI)

**コピーではなく、参照を。**

Excel / CSV / XML の表データを Markdown 文書から宣言的・読み取り専用に参照する VS Code 拡張です。

```md
![[./設計データ.xlsx#状態遷移|A1:F20?header=first&caption=状態遷移表&id=tbl-state]]
```

## クイックスタート

1. Markdown ファイル（`.md`）に `![[./data.csv#Sheet1|A1:D10?header=first]]` と記述
2. `Ctrl+Shift+V` でプレビューを開く → テーブルとして表示
3. 詳細: [チュートリアル](../04_Documentation/tutorial.md)

## 主な機能

- **正本保護（Read-only MUST）**: 参照経路から元データを改変できない構造的安全装置
- **クエリエンジン**: 宣言的記法 `![[...]]` で必要な断面だけを抽出
- **Smart Fallback**: 巨大表の自動カード縮退＋「外部アプリで開く」ボタン
- **エンタープライズ印刷制御**: caption / pageBreak / orientation の実 PDF 再現実証済み
- **Delivery Manifest**: 別紙一覧の CSV 自動生成
- **Diagnostics**: リンク切れ・シート不在のリアルタイム検知
- **DX**: オートコンプリート（ファイルパス・シート・範囲・クエリキー）、ペースト/ドロップ挿入

## サポート形式

| 形式 | 拡張子 |
|---|---|
| Excel Workbook | `.xlsx` |
| CSV / TSV | `.csv` `.tsv` |
| XML Spreadsheet 2003 | `.xml` |

## 開発

```bash
npm ci
npm run build
npm test          # unit + conformance corpus + Phase 9 sync/guide-sync (224 tests)
npm run test:e2e  # VS Code Extension Host 上での描画検証
```

- **AI エージェント向け入口**: [AGENTS.md](../AGENTS.md)
- **要件定義**: [requirements.md](../00_Prompt/requirements.md)
- **ADR と Issue**: [01_Plans/](../01_Plans/)

## ライセンス

MIT — [LICENSE](../LICENSE)
