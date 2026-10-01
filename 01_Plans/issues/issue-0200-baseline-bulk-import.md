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
- [x] Converter由来の内容とMMIがsourceから直接観測したCandidateを対応付け、対応できないものを黙って「取込済み」にしない。
- [x] 一括変換で作った画像・表もissue-0195の台帳へ登録でき、後の `inspect --unimported` と整合する。
- [x] Converterを利用できない環境でも個別のinspect / extract経路は動作する。
- [x] 外部Converter固有の記法を最終成果物へ必須にしない。materialize後のMarkdown/assetsは通常のツールで読める。
- [x] 変換結果にはsource、Converter名・版、MMI版、変換条件をprovenanceとして残す。

## Implementation checkpoint（2026-10-02）

`src/core/baselineImport.ts` に、外部Converterを権威化しない最小orchestrationを追加した。処理は `source → converter artifacts → explicit Candidate reconciliation → import ledger` の4段階で、次をfail-closedにする。

- 現在のsource bytesとCandidateの`sourceDigest`が一致しなければConverterを実行しない。
- Converter artifactは`outputRoot`配下の相対pathだけを許可し、実ファイルのsha256が申告digestと一致することを検証する。
- Reconcilerは全Candidateへexactly oneの`matched / unmatched / ambiguous` decisionとEvidenceを返す。
- `matched`だけがartifactを指せる。`unmatched / ambiguous`はConverterがファイルを生成していてもledgerへ入らない。
- matched artifactは既存`mmi.ledger/v1`へ登録し、`converterId / converterVersion / artifactId / artifactDigest / conversion options`を変換条件として残す。
- 外部Converter固有の依存はCoreへ入れず、Converter interfaceの外側へ閉じ込める。
- ledger provenanceにはsource/sourceDigestに加えて、Converter ID/版、MMI版、artifact ID/digest、conversion options、reconciliation Evidenceを残す。呼出側optionsより予約provenanceを優先し、偽装上書きを許さない。
- artifact pathは実行OSに依存せずPOSIX/Windows双方のabsolute path・traversalを拒否する。

成果物contractは`markdown`または`asset`の通常ファイルに限定し、Candidate identity/reconciliation/provenanceは成果物本文へ埋め込まず`mmi.ledger/v1`へ分離する。したがってMMIを外してもmaterialize済みMarkdown/assetsは通常のツールで読め、外部Converter固有の記法をMMI側の必須記法にはしない。

`test/baselineImport.test.ts` では、画像だけmatched・表はunmatchedのrun、表と画像の両方をmatchedしてstrict `unimported`が空になるrun、全件ambiguous、decision欠落、artifact digest不一致、POSIX/Windows双方のoutputRoot escape、stale Candidate、予約provenance上書き、malformed converter outputを固定した。実Converterをまだ呼ばない段階でも「対応できないものを黙って取込済みにしない」契約を検証できる。

### MarkItDown preliminary evaluation

最初の評価候補としてMicrosoft MarkItDown 0.1.8（2026-09-21 release）を確認した。release tag `v0.1.8` は commit `b8f79c57ebc0044be41323d89b2a45d3fda8460e` を指す。

- PyPI: https://pypi.org/project/markitdown/0.1.8/
- XLSX converter: https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_xlsx_converter.py
- OCR extensionのXLSX説明: https://github.com/microsoft/markitdown/blob/main/packages/markitdown-ocr/README.md

現行XLSX converterはpandas/openpyxlを使い、各sheetをMarkdown tableへ変換する。画像処理hookはあるがcore converterでは既定で有効化されず、画像を扱うextensionでもsheet tableの後に画像群を置く方式で、元anchorとの空間関係をMarkdown出力へ保持するものではない。したがって**baseline Markdown生成器としては候補になるが、MMIの画像Candidate/anchor/provenanceを置き換えられない**。次段ではissue-0194 fixtureを0.1.8へ通し、表・画像・sheet境界・情報落ちを実測する。

### MarkItDown CLI adapter / evaluation runner

`src/converters/markItDownCliConverter.ts` はMarkItDownを**optional local executable**として扱う。MMIのnpm dependencyには追加せず、`markitdown --version`で実際の版を取得してから、shellを介さない`execFile`で `markitdown <source> -o <output>` を呼ぶ。plugins、Document Intelligence、Content Understandingは自動で有効化しない。`keepDataUris`だけを明示opt-in optionとして許可する。失敗runでは既存outputを消してから実行するため、古いMarkdownを成功結果として再利用しない。

`src/evaluation/markItDownBaselineEvaluation.ts` と `scripts/baseline-converter-eval/markitdown.ts` はissue-0194のコード生成fixtureを使い、MMIが観測するsheet/Candidate/画像と、MarkItDownが生成したMarkdownのsheet heading・table separator・image referenceを同じJSON reportへ記録する。report自身はCandidate reconciliationを行わず、`automaticImportDecision: none`を固定する。converter artifactは評価時にもcontainmentと実bytes digestを再検証する。

実行経路。外部実行ではreportと実Markdownを同じartifact rootへ残し、受領側で再検証する。

```sh
cd 03_Implement
mkdir -p ../artifacts/markitdown-0.1.8

node --import tsx scripts/baseline-converter-eval/markitdown.ts \
  --out-dir ../artifacts/markitdown-0.1.8 \
  --report-out ../artifacts/markitdown-0.1.8/report.json \
  --expected-version 0.1.8

node --import tsx scripts/baseline-converter-eval/validate-markitdown-report.ts \
  --report ../artifacts/markitdown-0.1.8/report.json \
  --artifact-root ../artifacts/markitdown-0.1.8

node --import tsx scripts/baseline-converter-eval/validate-markitdown-handoff.ts \
  --handoff test/fixtures/baseline-converter-markitdown-0.1.8-handoff-v1.json \
  --report ../artifacts/markitdown-0.1.8/report.json \
  --artifact-root ../artifacts/markitdown-0.1.8

node --import tsx scripts/baseline-converter-eval/assess-markitdown-handoff.ts \
  --handoff test/fixtures/baseline-converter-markitdown-0.1.8-handoff-v1.json \
  --spec test/fixtures/baseline-converter-markitdown-screen-design-assessment-v1.json \
  --report ../artifacts/markitdown-0.1.8/report.json \
  --artifact-root ../artifacts/markitdown-0.1.8
```

`baseline-converter-markitdown-screen-design-assessment-v1.json` は、fixture内の文字列sentinel、既知表`画面一覧!A1:B3`、source sheet/image件数と、観測する軸を固定する。assessmentはsheet headingのpresent/missing、文字列sentinelのpresent/missing、Markdown table separator行数、source画像occurrence数、Markdown画像参照数、Candidate addressabilityだけを出す。quality score、合否閾値、automatic import decisionは持たない。実測結果を受け取った後の解釈を、都合のよい閾値へ寄せないためである。

正本の外部実行requestは`test/fixtures/baseline-converter-markitdown-0.1.8-handoff-v1.json`とする。ここでupstream tag/commit、0.1.8のCLI/XLSX converter等のGit blob、MMI側fixture generator/runner/evaluator/validator/adapterのGit blob、fixtureの3 sheet・4画像occurrence identity、出力名、禁止境界を固定した。`test/markItDownEvaluationHandoff.test.ts`はMMI側5ファイルの実Git blob SHAを再計算し、request作成後の変更を検出する。

成功時の`report.json`はmachine-local absolute pathを含まず、fixture label、source SHA-256、Converter ID/実version、MMI観測Candidate/画像、sheet heading、table/image evidence、Markdown artifact digest/byte sizeを持つ。`validate-markitdown-report.ts` は汎用schemaとartifact integrityを検証し、`validate-markitdown-handoff.ts` はさらにrequested version、fixture label、sheet identity、4画像のsheet/name/range、expected artifact名まで凍結requestと照合する。いずれも`automaticImportDecision: none`を必須とし、外部評価結果だけでCandidateを取込済みに昇格させない。

現在のこの作業実行環境ではMarkItDown package/CLIが未導入で、`importlib.metadata`上も`PackageNotFoundError`だった。PyPIからの一時導入もDNS名前解決でpayload取得前に失敗した。このため**実fixture変換結果はまだ記録しない**。runnerは未導入時にexit code 2と`status: unavailable`をstderrへ返し、既存の`mmi inspect` / `mmi extract`とは依存関係を持たない。受入条件「既存Converterをfixtureで評価」は、凍結handoff requestどおりに生成した0.1.8のreport+Markdownをhandoff validatorで受理し、assessment runnerの記述的観測値を本Issueへ記録するまで未完了のままとする。

## Validation plan

表、貼付画像、シートをまたぐ内容を含む架空のExcelを用意し、外部Converter単独の出力とMMI統合後の出力を比較する。情報落ち、画像の対応、重複候補、台帳登録、再実行時の未取込候補を確認する。

## Remaining work

- Converterは固定しない。MarkItDownは最初の評価候補であり、採用を前提にしない。
- markdown-itはMarkdown側のparse/render用途には使えるが、Excel→Markdownのbaseline converterとは別責務として扱う。
- 大量文書の一括処理と並列化は、1文書の縦切りが成立してから検討する。
