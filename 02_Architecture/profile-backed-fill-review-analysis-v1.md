# Profile-backed Fill Review Analysis v1

## 1. 目的

Format Profile（書式に関する情報を保持する資産）をruntime（実行時）の既知書式として利用し、
塗りつぶし情報を含むfill-aware pathと、構造情報に絞るstructure-only control pathを比較する。

baseline Worksheet snapshot（基準となるワークシートの観測記録）はFormat Profileの生成・承認時に必要だが、
review（確認）のたびに再提出を求めるものではない。

## 2. Two paths

Primary（塗りつぶしを含める比較経路）では、approved Format Profile（承認済みの書式資産）を通常のSheetJS fill-aware source profileとして
WorksheetFormatPrototypeへ変換し、observation snapshot（観測対象のスナップショット）と照合する。

Control（構造のみを比べる対照経路）では、同じapproved Profileのcanonical features（正規化された特徴）からfill evidenceとborder evidence（塗りつぶし・罫線に関する根拠）を除き、
structure-only prototypeを生成する。observation snapshotも、同じstructure-only evidence contract（構造のみを比較する根拠の契約）で照合する。

## 3. Shared filtering

evidence（比較に用いる根拠）の種類に応じてfeature（特徴）を選ぶ規則は、WorksheetFormatPrototype moduleを正本とする。
このanalysis（比較分析）の側では、header:*fill等の判定規則を重複して実装しない。

## 4. Fill facts

review reason（確認理由）の分類に必要なprototype fill tone（試作表現における塗りつぶしの色調）は、approved Profileのcanonical featuresから取得する。
その分類にraw baseline cell（基準シートの個々の生セル）やsnapshot全体を改めて用いる必要はない。

meaningful fill fact（分類に使う塗りつぶしの特徴）は、header:dark-fill / header:gray-fill / header:light-fillとする。

## 5. Approval / compatibility

Profileからの変換には、既存のformatProfileToWorksheetPrototypeを必ず使う。
これにより、candidate、featureVersion不一致、sourceProfileId不一致、sourceEvidence不一致に対する拒否判定は、既存contract（検証上の取り決め）に委ねる。

## 6. Reason semantics

reason（確認理由）の分類には、issue-0156の共通classifier（分類処理）を再利用する。
Profile-backed path専用のtaxonomy（理由の分類体系）は新たに設けない。

## 7. 非責務

- Profile自動承認
- baseline snapshot永続化
- matcher threshold変更
- XLSX reading
- production UI / plugin wiring
