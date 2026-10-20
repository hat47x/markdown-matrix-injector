# Word文書（.docx）の読み取り

MMIは、Word文書を**読み取り専用**で観測し、見出し・表・画像・コメントをSemantic Candidateとして一覧できます。原本のWordファイルを書き換えたり、内容を要約・確定したりはしません。WordをMMI記法の参照先（Linked）にする機能ではありません。

この入口はIssue #531の最小縦切りです。Excel併用執筆（#514）の受入を置き換えません。

## できること

```sh
# 文書の構造を一覧する（人が読む形）
mmi inspect ./docs/basic-design.docx

# JSONでCandidateと構造位置を取得する
mmi inspect ./docs/basic-design.docx --json

# レビュー済みの表をMarkdown資産として取り出す
mmi extract ./docs/basic-design.docx \
  --docx-table 1 \
  --expected-fingerprint sha256:... \
  --root . --out-dir assets/docx --ledger mmi-ledger.json

# レビュー済みの画像を内容アドレスな画像資産として取り出す
mmi extract ./docs/basic-design.docx \
  --docx-image 1 \
  --expected-fingerprint sha256:... \
  --root . --out-dir assets/docx --ledger mmi-ledger.json
```

`--expected-fingerprint`は、`mmi inspect --json`が返したレビュー時点のfingerprintです。指定がない抽出は行いません。取り出し時点で表・画像が変わっていれば拒否し、古いレビューを引き継ぎません。

## 観測する情報と状態

| 対象 | Candidate | 原本が明示している場合 | 明示がない場合 |
| --- | --- | --- | --- |
| 見出し | `section` | `w:pStyle`が見出しスタイル、または`w:outlineLvl`があるとき`observed` | 太字・文字サイズから推定しない |
| 表 | `table-range` | 行・列・セル、`gridSpan`、`vMerge`を`observed` | 見出し行は`w:tblHeader`がなければ`abstained` |
| 画像 | `image` | 埋込み関係、媒体形式、バイト数、sha256、図形名・代替テキストを`observed` | 外部リンクは取得せず診断 |
| コメント | `note` | コメントID、本文、作成者、日付、アンカーの段落位置を`observed` | アンカーがない場合は`abstained` |

構造位置は`/body/p[3]`、`/body/tbl[1]/tr[2]/tc[1]`、`/body/p[5]/drawing[1]`のように、文書内の順序で表します。セル座標（A1）はWordには存在しないため使いません。

Markdownへの投影では、表の先頭行を見出し行として使います。これは変換上の選択であり、原本が見出し行を指定していない場合の`header-row` Claimは`abstained`のままです。

## 出力と台帳

- 表は`table-<digest>.md`として書き出し、GFM表と`mmi:extracted-table`の出典コメントを含めます。
- 画像は`<digest>.png`などの内容アドレス名で書き出し、`![代替テキスト](相対パス)`と出典コメントを返します。
- 台帳には`table-range`または`image`のCandidate、レビュー時のfingerprint、Claim basis、出力先、変換条件を記録します。
- 出力先は`--root`の内側に限ります。symlinkをたどった先への書き込み、既存ファイルの内容衝突、原本への上書きは拒否します。
- 台帳の更新に失敗した場合、この操作で新規作成した出力だけを回収します。既存ファイルは削除しません。

## 初版の非対象

変更履歴の受入・却下、ヘッダ・フッタ、脚注・文末脚注、テキストボックス内の本文、SmartArt・グラフの意味解釈、`.doc`旧形式、コメントの解決状態の変更、Wordの見た目の再現は対象外です。入れ子表は外側のセルへ平坦化せず、別Candidateと診断に残します。

## 検証状況

- 自動テスト: 合成したWordprocessingMLと、実際のWordprocessingML生成器で作ったfixture（見出し・表・画像）で確認済み。
- 未確認: 実在の業務設計書、Word for Windows/Macで保存した文書、変更履歴・コメントを含む実文書、VS Codeレビュー画面との接続。これらは実機確認として別に扱います。
- 関連: [ADR-0026](../01_Plans/adr/ADR-0026-word-source-adapter-read-only-boundary.md)、[Candidate契約](../02_Architecture/candidate-contract-v1.md)、Issue #531。
