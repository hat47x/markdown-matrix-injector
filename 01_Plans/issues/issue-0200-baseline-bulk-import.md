# Issue: 初回一括変換を既存ConverterとCandidate基盤へ接続する

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: src/core（import orchestration）、src/cli、converter evaluation、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D9・D10、製品要求「一括変換」「個別取り込み」「provenance」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「一括変換」
- Dependency: issue-0193（Candidate契約、Done）、issue-0195（取り込み台帳、Done）。Excel画像を含む評価はissue-0194（Done）も利用する

## 背景

新規プロジェクトへ既存資産を持ち込む初回だけは、1件ずつCandidateを選ぶより文書全体のベースライン変換が合理的である。一方、外部Converterの出力をそのまま正本にすると、画像のanchor、空間関係、候補状態、取り込み済み判定、provenanceが失われる。

既存Converterは「初期Markdownを作る部品」として利用し、MMIのSource Adapter / Candidate / import ledgerと統合する。ConverterをMMIのExcel解析基盤そのものにはしない。

issue-0195で確定した`mmi.ledger/v1`を再利用する。一括変換専用の第二台帳は作らず、Converter固有情報は`conversion`とprovenanceへ記録する。delivery manifestはLinkedの納品一覧で責務が異なるため、一括変換の取込済み判定には使わない。

## Acceptance criteria

- [x] 初回一括変換の処理境界を設計する。少なくとも `source → baseline conversion → Candidate reconciliation → Markdown/assets → import ledger` を分離する。
- [ ] MarkItDown等、Office文書からMarkdownを生成できる既存Converterを1つ以上評価する。表、本文、画像、シート境界、失われる情報をfixtureで記録する。
- [ ] Converter由来の内容とMMIがsourceから直接観測したCandidateを対応付け、対応できないものを黙って「取込済み」にしない。
- [ ] 一括変換で作った画像・表もissue-0195の台帳へ登録でき、後の `inspect --unimported` と整合する。
- [ ] Converterを利用できない環境でも個別のinspect / extract経路は動作する。
- [ ] 外部Converter固有の記法を最終成果物へ必須にしない。materialize後のMarkdown/assetsは通常のツールで読める。
- [ ] 変換結果にはsource、Converter名・版、MMI版、変換条件をprovenanceとして残す。

## Implementation checkpoint（2026-10-02）

`src/core/baselineImport.ts` に、外部Converterを権威化しない最小orchestrationを追加した。処理は `source → converter artifacts → explicit Candidate reconciliation → import ledger` の4段階で、次をfail-closedにする。

- 現在のsource bytesとCandidateの`sourceDigest`が一致しなければConverterを実行しない。
- Converter artifactは`outputRoot`配下の相対pathだけを許可し、実ファイルのsha256が申告digestと一致することを検証する。
- Reconcilerは全Candidateへexactly oneの`matched / unmatched / ambiguous` decisionとEvidenceを返す。
- `matched`だけがartifactを指せる。`unmatched / ambiguous`はConverterがファイルを生成していてもledgerへ入らない。
- matched artifactは既存`mmi.ledger/v1`へ登録し、`converterId / converterVersion / artifactId / artifactDigest / conversion options`を変換条件として残す。
- 外部Converter固有の依存はCoreへ入れず、Converter interfaceの外側へ閉じ込める。

`test/baselineImport.test.ts` では、画像だけmatched・表はunmatchedのrun、全件ambiguous、decision欠落、artifact digest不一致、outputRoot escape、stale Candidateを固定した。実Converterをまだ呼ばない段階でも「対応できないものを黙って取込済みにしない」契約を検証できる。

### MarkItDown preliminary evaluation

最初の評価候補としてMicrosoft MarkItDown 0.1.8（2026-09-21 release）を確認した。

- PyPI: https://pypi.org/project/markitdown/0.1.8/
- XLSX converter: https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_xlsx_converter.py
- OCR extensionのXLSX説明: https://github.com/microsoft/markitdown/blob/main/packages/markitdown-ocr/README.md

現行XLSX converterはpandas/openpyxlを使い、各sheetをMarkdown tableへ変換する。画像処理hookはあるがcore converterでは既定で有効化されず、画像を扱うextensionでもsheet tableの後に画像群を置く方式で、元anchorとの空間関係をMarkdown出力へ保持するものではない。したがって**baseline Markdown生成器としては候補になるが、MMIの画像Candidate/anchor/provenanceを置き換えられない**。次段ではissue-0194 fixtureを0.1.8へ通し、表・画像・sheet境界・情報落ちを実測する。

## Validation plan

表、貼付画像、シートをまたぐ内容を含む架空のExcelを用意し、外部Converter単独の出力とMMI統合後の出力を比較する。情報落ち、画像の対応、重複候補、台帳登録、再実行時の未取込候補を確認する。

## Remaining work

- Converterは固定しない。MarkItDownは最初の評価候補であり、採用を前提にしない。
- markdown-itはMarkdown側のparse/render用途には使えるが、Excel→Markdownのbaseline converterとは別責務として扱う。
- 大量文書の一括処理と並列化は、1文書の縦切りが成立してから検討する。
