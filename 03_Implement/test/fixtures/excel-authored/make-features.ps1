# Builds authentic Excel files exercising names, tables and modern features.
# Excel runs hidden and is always quit. Output goes to this folder only.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = New-Object System.Collections.Generic.List[string]
function Note($m) { $log.Add($m); Write-Output $m }
function SetV($cell, $v) { if ($v -is [int] -or $v -is [double]) { $cell.Value2 = [double]$v } else { $cell.Value2 = [string]$v } }
function Try-Step($name, [scriptblock]$block) {
  try { & $block; Note "ok   $name" } catch { Note "FAIL $name :: $($_.Exception.Message)" }
}

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$xl.ScreenUpdating = $false
try {
  Note "excel $($xl.Version) build $($xl.Build)"
  $wb = $xl.Workbooks.Add()
  while ($wb.Worksheets.Count -lt 6) { [void]$wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)) }

  # 1. Plain data + defined names (cell, row, column, range, sheet-scope, dynamic, broken)
  $s = $wb.Worksheets.Item(1); $s.Name = '名前'
  $rows = @(@('受注番号','顧客','数量','金額'), @('ORD-001','架空商事',3,3000), @('ORD-002','見本工業',5,7500), @('ORD-003','試験物産',1,1200), @('ORD-004','架空商事',2,2400), @('ORD-005','見本工業',4,5600))
  for ($r = 0; $r -lt $rows.Count; $r++) { for ($c = 0; $c -lt 4; $c++) { SetV $s.Cells.Item($r + 1, $c + 1) $rows[$r][$c] } }
  $s.Range('F1').Value2 = '税率'; $s.Range('F2').Value2 = 0.1
  Try-Step 'name: range' { [void]$wb.Names.Add('受注一覧', '=名前!$A$1:$D$6') }
  Try-Step 'name: cell' { [void]$wb.Names.Add('税率', '=名前!$F$2') }
  Try-Step 'name: row' { [void]$wb.Names.Add('見出し行', '=名前!$1:$1') }
  Try-Step 'name: column' { [void]$wb.Names.Add('金額列', '=名前!$D:$D') }
  Try-Step 'name: sheet scope' { [void]$s.Names.Add('ローカル範囲', '=名前!$A$2:$B$3') }
  Try-Step 'name: dynamic OFFSET' { [void]$wb.Names.Add('動的範囲', '=OFFSET(名前!$A$1,0,0,COUNTA(名前!$A:$A),4)') }
  Try-Step 'name: constant' { [void]$wb.Names.Add('上限件数', '=500') }
  Try-Step 'name: broken #REF!' { [void]$wb.Names.Add('壊れた名前', '=#REF!') }

  # 2. Excel table (ListObject) with style, total row and a calculated column
  $t = $wb.Worksheets.Item(2); $t.Name = 'テーブル'
  $t.Range('B2').Value2 = '受注明細（テーブル）'
  $data = @(@('明細ID','商品','数量','単価'), @('L-01','ボルト',10,50), @('L-02','ナット',20,30), @('L-03','ワッシャー',15,10), @('L-04','ボルト',5,50))
  for ($r = 0; $r -lt $data.Count; $r++) { for ($c = 0; $c -lt 4; $c++) { SetV $t.Cells.Item($r + 4, $c + 2) $data[$r][$c] } }
  Try-Step 'table: ListObject' {
    $lo = $t.ListObjects.Add(1, $t.Range('B4:E8'), [Type]::Missing, 1)
    $lo.Name = 'T_受注明細'
    $lo.TableStyle = 'TableStyleMedium9'
  }
  Try-Step 'table: calculated column' {
    $lo = $t.ListObjects.Item('T_受注明細')
    $col = $lo.ListColumns.Add()
    $col.Name = '金額'
    $col.DataBodyRange.Formula = '=[@数量]*[@単価]'
  }
  Try-Step 'table: total row' { $t.ListObjects.Item('T_受注明細').ShowTotals = $true }
  Try-Step 'formula: structured reference' { $t.Range('H4').Formula = '=SUM(T_受注明細[金額])' }

  # 3. Dynamic arrays (spill)
  $d = $wb.Worksheets.Item(3); $d.Name = 'スピル'
  $d.Range('A1').Value2 = '連番'; $d.Range('B1').Value2 = '顧客（重複なし）'; $d.Range('C1').Value2 = '大口'
  Try-Step 'spill: SEQUENCE' { $d.Range('A2').Formula2 = '=SEQUENCE(4)' }
  Try-Step 'spill: UNIQUE' { $d.Range('B2').Formula2 = '=UNIQUE(名前!B2:B6)' }
  Try-Step 'spill: FILTER on table' { $d.Range('C2').Formula2 = '=FILTER(T_受注明細[商品],T_受注明細[数量]>=10)' }
  Try-Step 'formula: LET' { $d.Range('E1').Value2 = 'LET'; $d.Range('E2').Formula2 = '=LET(x,3,x*x)' }
  Try-Step 'formula: LAMBDA' { $d.Range('F1').Value2 = 'LAMBDA'; $d.Range('F2').Formula2 = '=LAMBDA(a,a+1)(41)' }

  # 4. Modern cell content and display features
  $m = $wb.Worksheets.Item(4); $m.Name = 'モダン'
  $m.Range('A1').Value2 = '項目'; $m.Range('B1').Value2 = '値'
  $labels = @('チェックボックス','セル内画像','日付','通貨','割合','改行を含む文字','ハイパーリンク','エラー値','真偽値','非表示の行')
  for ($i = 0; $i -lt $labels.Count; $i++) { $m.Cells.Item($i + 2, 1).Value2 = $labels[$i] }
  Try-Step 'checkbox: CellControl' { $m.Range('B2').Value2 = $true; $m.Range('B2').CellControl.SetCheckbox() }
  Try-Step 'picture in cell' { [void]$m.Range('B3').InsertPictureInCell((Join-Path $dir 'dot.png')) }
  Try-Step 'date' { $m.Range('B4').Formula = '=DATE(2026,9,27)'; $m.Range('B4').NumberFormat = 'yyyy/mm/dd' }
  Try-Step 'currency' { $m.Range('B5').Value2 = 1234567; $m.Range('B5').NumberFormat = '"¥"#,##0' }
  Try-Step 'percent' { $m.Range('B6').Value2 = 0.125; $m.Range('B6').NumberFormat = '0.0%' }
  Try-Step 'line break' { $m.Range('B7').Value2 = "一行目`n二行目" }
  Try-Step 'hyperlink' { $m.Range('B8').Value2 = '仕様書'; [void]$m.Hyperlinks.Add($m.Range('B8'), 'https://example.invalid/spec') }
  Try-Step 'error value' { $m.Range('B9').Formula = '=NA()' }
  Try-Step 'boolean' { $m.Range('B10').Value2 = $false }
  Try-Step 'hidden row' { $m.Range('B11').Value2 = '見えない値'; $m.Rows.Item(11).Hidden = $true }
  Try-Step 'conditional format data bar' { [void]$m.Range('B5:B6').FormatConditions.AddDatabar() }
  Try-Step 'data validation list' { $m.Range('C2').Value2 = '承認'; $m.Range('C2').Validation.Add(3, 1, 1, '承認,差戻し,保留') }
  Try-Step 'note' { [void]$m.Range('A2').AddComment('メモ') }
  Try-Step 'threaded comment' { [void]$m.Range('A3').AddCommentThreaded('スレッドのコメント') }
  Try-Step 'hidden column' { $m.Range('D1').Value2 = '隠し列'; $m.Columns.Item(4).Hidden = $true }

  # 5. Autofilter hiding rows and grouped (outlined) rows
  $f = $wb.Worksheets.Item(5); $f.Name = 'フィルター'
  $fr = @(@('ID','状態'), @('1','完了'), @('2','保留'), @('3','完了'), @('4','保留'))
  for ($r = 0; $r -lt $fr.Count; $r++) { for ($c = 0; $c -lt 2; $c++) { SetV $f.Cells.Item($r + 1, $c + 1) $fr[$r][$c] } }
  Try-Step 'autofilter hiding rows' { [void]$f.Range('A1:B5').AutoFilter(2, '完了') }
  Try-Step 'grouped rows collapsed' { $f.Range('A8').Value2 = '明細A'; $f.Range('A9').Value2 = '明細B'; [void]$f.Rows('8:9').Group(); $f.Outline.ShowLevels(1) }

  # 6. Very hidden sheet
  $v = $wb.Worksheets.Item(6); $v.Name = '非表示シート'; $v.Range('A1').Value2 = '隠し'
  Try-Step 'very hidden sheet' { $v.Visible = 2 }

  $xl.Calculate()
  $base = Join-Path $dir 'features'
  Try-Step 'save xlsx' { $wb.SaveAs("$base.xlsx", 51) }
  Try-Step 'save xlsm' { $wb.SaveAs("$base.xlsm", 52) }
  Try-Step 'save xlsb' { $wb.SaveAs("$base.xlsb", 50) }
  Try-Step 'save xls (97-2003)' { $wb.SaveAs("$base.xls", 56) }
  $wb.Close($false)
} finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  $log | Set-Content -Encoding utf8 (Join-Path $dir 'make-features.log')
}
