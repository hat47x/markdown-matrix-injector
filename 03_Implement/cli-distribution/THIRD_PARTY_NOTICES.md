# Third-party notices

MMI CLIの配布artifactには、runtime依存packageをnpmのbundleDependenciesで同梱します。各dependencyに含まれる著作権表示とライセンス本文は、そのpackage内のファイルを改変せず保持します。

## 同梱するruntime依存の一覧

`package-lock.json`から導いたruntime依存の閉包を、版とライセンス付きで列挙します。同名で版が違うもの（`entities`）は別の行にします。この表は `test/cliDistribution.test.mjs` が lock の閉包と照合し、依存を足したり版を上げたりして表が古くなると失敗します。`npm run package:cli` は、同じ内容を `*.manifest.json` として tarball の隣へ保存します。

<!-- runtime-closure:begin -->
| package | version | license | path |
| --- | --- | --- | --- |
| argparse | 2.0.1 | Python-2.0 | node_modules/argparse |
| entities | 4.5.0 | BSD-2-Clause | node_modules/entities |
| linkify-it | 5.0.2 | MIT | node_modules/linkify-it |
| markdown-it | 14.3.1 | MIT | node_modules/markdown-it |
| mdurl | 2.0.0 | MIT | node_modules/mdurl |
| parse5 | 7.3.0 | MIT | node_modules/parse5 |
| entities | 6.0.1 | BSD-2-Clause | node_modules/parse5/node_modules/entities |
| punycode.js | 2.3.1 | MIT | node_modules/punycode.js |
| saxes | 6.0.0 | ISC | node_modules/saxes |
| uc.micro | 2.1.0 | MIT | node_modules/uc.micro |
| xlsx | 0.20.3 | Apache-2.0 | node_modules/xlsx |
| xmlchars | 2.2.0 | MIT | node_modules/xmlchars |
| yaml | 2.9.1 | ISC | node_modules/yaml |
<!-- runtime-closure:end -->

ライセンス本文と著作権表示は、各packageの配布物（`node_modules/<name>`内のファイル）を正とし、この文書へは転記しません。

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

- Version: 14.3.1
- License: MIT
- `markdown-it`はMMI CLIのruntime dependencyとして同梱します。著作権表示とライセンス本文は、同梱する`node_modules/markdown-it`内の配布物を正とします。
- `markdown-it`に従属する次の6件も同梱します。
  - `entities@4.5.0`（BSD-2-Clause）
  - `argparse@2.0.1`（Python-2.0。他の依存と異なるライセンスです。本文は`node_modules/argparse/LICENSE`にあります）
  - `linkify-it@5.0.2`（MIT）
  - `mdurl@2.0.0`（MIT）
  - `punycode.js@2.3.1`（MIT）
  - `uc.micro@2.1.0`（MIT）


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
