# ADR-0030: 境界外の参照は、存在確認より先に`MMI_PATH_OUTSIDE_BOUNDARY`とする

- Status: Proposed
- Date: 2026-10-21
- Deciders: MMI Lead Agent（実装案の提示。採否はHuman Sponsor）
- Scope: MMI Notation v1 §9・P4、`src/core/pathResolver.ts`、`src/dx/vscodeAdapters.ts`、`src/dx/diagnostics.ts`、conformance corpus
- Related: [ADR-0012](ADR-0012-mission-redefinition-notation-as-governance-boundary.md)、[ADR-0026](ADR-0026-word-source-adapter-read-only-boundary.md)、Issue #599

## Context

MMIのP4（Containment）は、参照の解決をワークスペース境界の内側に限定する。一方、v1.0.0-draft.1の§9は`MMI_PATH_OUTSIDE_BOUNDARY`を「`target`はファイルとして存在するが境界外」と定義していたため、境界外の参照は次のように振る舞っていた。

- 境界外にファイルがある → `MMI_PATH_OUTSIDE_BOUNDARY`
- 境界外にファイルがない → `MMI_FILE_NOT_FOUND`

この振る舞いには二つの問題がある。

1. 文書を書く人が、参照の文言を変えて診断を見るだけで、ワークスペース外のファイルの存在を確かめられる。
2. 同じ書き間違いが、OSや実行環境のファイル配置によって別の診断になる（Windowsの`/etc/hosts`問題）。

どちらもP4の「境界の外は見ない」という趣旨と、診断の再現性に反する。`MMI_PATH_OUTSIDE_BOUNDARY`の意味を変えることは、P6（診断コードは安定API）に触れるため、記法の版の扱いも決める必要がある。

## Decision

**B: 字句の上で境界を出る参照は、存在確認をせずに`MMI_PATH_OUTSIDE_BOUNDARY`とする。**

1. `resolveSourcePath()`は、文書基準とワークスペース基準の解決候補を作った後、**存在確認の前に**字句の境界判定を行う。境界内の候補が1つもない場合は、`PathContainmentError`を投げる。
2. 診断（`createDiagnosticsForDocument()` → `validateEmbedDiagnostics()`）も同じ判定を使う。`containmentOk === false`のときは`MMI_PATH_OUTSIDE_BOUNDARY`だけを返し、`MMI_FILE_NOT_FOUND`を返さない。境界外のパスへ`existsSync`/`fileExists`を呼ばない。
3. 境界内の候補が存在する場合は、従来どおり実体を`realpath`で確認する。境界内の候補がシンボリックリンクで外を指す場合は`MMI_PATH_OUTSIDE_BOUNDARY`とする（#599のRemaining work）。
4. 境界内の候補が存在しない場合は、従来どおり`MMI_FILE_NOT_FOUND`とする。
5. 診断コードの**名前**は変えない。意味の変更は、まだ凍結前の`1.0.0-draft.2`で行う。v1.0.0の凍結後に同じ変更をする場合はmajor（v2）の扱いとする。
6. conformance corpusへ「境界外で存在しない参照」のケースを追加し、path resolverとdiagnosticsの単体テストで、存在確認より先に判定することを固定する。

## Consequences

- **Good:** 境界外の参照は、ファイルの有無にかかわらず同じ診断になる。診断から外部ファイルの存在を推測できない。OSによる差が減り、conformance caseもプラットフォーム非依存になる。P4の「境界の外は見ない」と実装が一致する。
- **Bad:** 従来`MMI_FILE_NOT_FOUND`を期待していた境界外・非存在の参照は、`MMI_PATH_OUTSIDE_BOUNDARY`に変わる。既存の利用者文書やテストの期待値を更新する必要がある。境界内の候補が存在しない場合と、境界外の場合で診断が分かれるため、利用者は「直し方」が2種類あることを理解する必要がある。P6の意味変更のため、リリースノートで明示する。
- **Traceability:** 実装は`src/core/pathResolver.ts`、`src/dx/vscodeAdapters.ts`、`src/dx/diagnostics.ts`。試験は`test/pathResolver.test.ts`、`test/diagnostics.test.ts`、`test/conformance/cases.json`。仕様は`04_Documentation/spec/mmi-notation-v1.md` §9・P4。

## Traceability

- Related Issues: [#599](https://github.com/hat47x/markdown-matrix-injector/issues/599)
- Related Docs: [MMI Notation v1](../../04_Documentation/spec/mmi-notation-v1.md)
