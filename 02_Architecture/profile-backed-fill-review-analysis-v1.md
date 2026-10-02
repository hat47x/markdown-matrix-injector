# Profile-backed Fill Review Analysis v1

## 1. 目的

Format Profileをruntimeの既知書式資産として直接利用し、
fill-aware pathとstructure-only control pathを比較する。

baseline Worksheet snapshotはFormat Profile生成・承認時には必要だが、
review時には再要求しない。

## 2. Two paths

Primaryではapproved Format Profileを通常のSheetJS fill-aware source profileで
WorksheetFormatPrototypeへ戻し、observation snapshotをmatchする。

Controlでは同じapproved Profileのcanonical featuresからfill evidenceとborder evidenceを除き、
structure-only prototypeを生成する。observation snapshotも同じstructure-only evidence contractでmatchする。

## 3. Shared filtering

evidence種別からfeatureを選ぶ規則はWorksheetFormatPrototype moduleを正本とする。
新しいanalysis側でheader:*fill等の判定規則を複製しない。

## 4. Fill facts

review reason分類に必要なprototype fill toneはapproved Profileのcanonical featuresから取得する。
raw baseline cellやsnapshotは不要。

meaningful fill factはheader:dark-fill / header:gray-fill / header:light-fillとする。

## 5. Approval / compatibility

Profileは既存formatProfileToWorksheetPrototypeを必ず通す。
したがってcandidate、featureVersion不一致、sourceProfileId不一致、sourceEvidence不一致の拒否を既存contractへ委譲する。

## 6. Reason semantics

reason分類はissue-0156の共通classifierを再利用する。
Profile-backed pathだけ別taxonomyを作らない。

## 7. 非責務

- Profile自動承認
- baseline snapshot永続化
- matcher threshold変更
- XLSX reading
- production UI / plugin wiring
