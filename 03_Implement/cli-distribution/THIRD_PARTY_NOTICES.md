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

## YAML

- Version: 2.9.1
- Source: https://www.npmjs.com/package/yaml
- License: ISC
- MMIによるYAML sourceの変更: なし

YAML parser packageの著作権表示とISCライセンス本文は、同梱する`node_modules/yaml`内の配布物を正とします。
