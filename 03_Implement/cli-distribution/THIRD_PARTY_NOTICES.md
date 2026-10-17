# Third-party notices

MMI CLIの配布artifactには、runtime依存packageをnpmのbundleDependenciesで同梱します。各dependencyに含まれる著作権表示とライセンス本文は、そのpackage内のファイルを改変せず保持します。

## SheetJS Community Edition

- Version: 0.20.3
- Source used by the build: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
- License: Apache License 2.0
- MMIによるSheetJS sourceの変更: なし

Attribution:

SheetJS Community Edition — https://sheetjs.com/  
Copyright (C) 2012-present SheetJS LLC  
Licensed under the Apache License, Version 2.0.

完全なApache-2.0本文とSheetJSの著作権・ライセンス表示は、同梱する`node_modules/xlsx`内の配布物を正とします。

## parse5

- Version: 7.3.0（package-lock.jsonで固定）
- License: MIT
- Purpose in MMI: HTML5 DOM解析、断片Candidate列挙、正規化HTML断片の保存。
- Runtime dependencyとしてCLI配布tarballへ同梱する。ライセンス全文と著作権表示の正本は同梱する`node_modules/parse5`内の配布ファイルとする。
- `parse5`に従属する`entities@6.0.1`はBSD-2-Clause。該当するライセンス本文と著作権表示も同梱パッケージ内の配布ファイルを正とする。

## markdown-it

`markdown-it`はMMI CLIのruntime dependencyとして同梱します。著作権表示とライセンス本文は、同梱する`node_modules/markdown-it`内の配布物を正とします。


## saxes

- Version: 6.0.0
- Source: https://github.com/lddubeau/saxes
- License: ISC
- Purpose in MMI: strict, namespace-aware parsing of generic XML Tree sources

The complete license text is retained in the bundled `node_modules/saxes`
package. `saxes` depends on `xmlchars@2.2.0` (MIT); its license text is
retained in the bundled `node_modules/xmlchars` package.

## yaml

- Version: 2.9.1
- Source: https://github.com/eemeli/yaml
- License: ISC
- Purpose in MMI: AST-preserving parsing of the restricted YAML Tree source profile

MMI rejects anchors, aliases, merge keys, explicit tags, non-string mapping keys,
YAML 1.1 documents and non-finite scalar numbers before treating YAML structure
as an observed Tree. The complete license text is retained in the bundled
`node_modules/yaml` package.
