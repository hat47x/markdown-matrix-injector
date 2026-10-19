# Executable Proposal Verified Review Workflow v1

## 1. 目的

Cognitive Review（認知による確認結果）からAuthority検証済みのreview surface（人に提示する確認用データ）まで、安全な組み立て順序をworkflow（処理の流れ）の内部にまとめ、呼び出し側から隠蔽する。

従来の個別API（呼び出し口）の構成は次のとおり。

```text
Envelope
 -> Presentation
 -> Authority Evidence
 -> Verified Review Surface
```

これらをUI側が自由に組み替えず、workflow内で順序を固定する。

## 2. Safe entrypoint

```ts
prepareExecutableProposalVerifiedReviewWithLoader(input, loader)
```

input（呼び出し時に渡す情報）に含める項目は次のとおり。

- envelope
- rawNotation
- markdownFilePath
- workspaceRoot
- issuer
- uriScheme

これらに限る。

次の情報はinputに含めない。

- presentation
- receipt
- evidence
- preloaded workbook
- Authority overlay

## 3. 固定された内部順序

1. EnvelopeからCognitive Review Presentationを生成
2. 同じrawNotationでAuthority Evidenceを生成
3. exact proposal identityを照合
4. Authority overlayを生成
5. verified review surfaceを返却

Envelope（認知結果を束ねたデータ）、Authority Evidence（決定論的な検証の根拠情報）、proposal identity（提案文字列の識別情報）、overlay（検証結果を示す別領域）の生成・照合は上記の順序に従う。各下位module（実装単位）の検証をworkflow側で再実装しない。

## 4. Default loader

async版（非同期の呼び出し口）は次のとおり。

```ts
prepareExecutableProposalVerifiedReviewWithDefaultLoader(input)
```

この関数はissue-0149のdefault-loader workflow（既定の読み込み処理を用いる経路）を再利用する。

production（製品実行時）の `loadWorkbook` のimport（モジュールの読み込み）や呼び出しはissue-0149に集約し、本workflowでは重複させない。

## 5. 結果

Authority（決定論的な検証）が次のいずれの状態でも、

- satisfied
- blocked

surfaceを返せる。

blocked（検証で止まった状態）は例外ではない。人が「どのcheck（確認項目）で止まったか」をreviewできる、通常の確認結果として扱う。

一方、schema（データ構造）・source（参照元）・proposal integrity（提案と証拠の対応の完全性）に違反し、surface自体を安全に組み立てられない場合は、fail-closed（安全側として拒否）して例外とする。

## 6. 非責務

- UI rendering
- apply / approval
- source mutation
- provider invocation
- Receipt issuer authentication
- production extension command
- fill telemetry

次段階のUI integration（画面との接続）では、このworkflowだけを呼び出す構造を推奨する。
