# Executable Proposal Verified Review Workflow v1

## 1. 目的

Cognitive ReviewからAuthority検証済みreview surfaceまでの安全な組立を、呼出側から隠蔽する。

従来の個別API:

```text
Envelope
 -> Presentation
 -> Authority Evidence
 -> Verified Review Surface
```

をUI側が自由に組み替えるのではなく、workflow内で固定順序にする。

## 2. Safe entrypoint

```ts
prepareExecutableProposalVerifiedReviewWithLoader(input, loader)
```

inputが含むのは:

- envelope
- rawNotation
- markdownFilePath
- workspaceRoot
- issuer
- uriScheme

のみ。

含まないは次のとおりです。

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

各下位moduleの検証をworkflow側で再実装しない。

## 4. Default loader

async版:

```ts
prepareExecutableProposalVerifiedReviewWithDefaultLoader(input)
```

はissue-0149のdefault-loader workflowを再利用する。

production `loadWorkbook` のimportや呼び出しは0149に集約し、本workflowで重複させない。

## 5. 結果

Authorityが:

- satisfied
- blocked

どちらでもsurfaceは返せる。

blockedは例外ではなく、人間が「どのcheckで止まったか」をreviewできる正常なreview結果である。

一方、schema/source/proposal integrity違反など、surface自体を安全に組めない場合はfail-closedで例外とする。

## 6. 非責務

- UI rendering
- apply / approval
- source mutation
- provider invocation
- Receipt issuer authentication
- production extension command
- fill telemetry

次段階のUI integrationは、このworkflowだけを呼ぶ構造を推奨する。
