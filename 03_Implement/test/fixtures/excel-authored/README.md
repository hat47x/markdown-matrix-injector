# Excelで作成したフィクスチャ

`make-features.ps1`をMicrosoft Excel 2016（Professional Plus、ビルド16.0.19127）で実行し、保存した`.xlsx`と`.xlsb`です（セル内画像には同じフォルダの`dot.png`を使います）。名前付き範囲（セル・行・列・範囲・シート単位・OFFSETの動的な名前・定数・`#REF!`）、Excelテーブル（テーブルスタイル・計算列・集計行）、非表示の行と列、オートフィルターで隠れた行、折りたたんだ行、非常に非表示のシート、セル内画像を含みます。

このExcelでは、スピル（SEQUENCE・UNIQUE・FILTER）、LET/LAMBDA、セル内チェックボックス、スレッド形式のコメントを作れませんでした。これらの読込みは`test/workbookStructure.test.ts`の中で、公開されたファイル形式に沿って組んだ部品で確かめています。値はすべて架空です。
