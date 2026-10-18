# One Excel operation on a workbook, saved by real Excel (hidden, always quit).
# Ops: create | value | insert-row-inside | append-row-outside | delete-row-below | rename-header | rename-sheet | add-sheet
param([Parameter(Mandatory)][string]$Book, [Parameter(Mandatory)][string]$Op)
$ErrorActionPreference = 'Stop'
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  if ($Op -eq 'create') {
    $wb = $xl.Workbooks.Add()
    $s = $wb.Worksheets.Item(1); $s.Name = '画面'
    $rows = @(@('項目名','型','必須'), @('受注番号','文字','○'), @('顧客コード','文字','○'), @('受注日','日付','○'))
    for ($r = 0; $r -lt $rows.Count; $r++) { for ($c = 0; $c -lt 3; $c++) { $s.Cells.Item($r + 1, $c + 1).Value2 = [string]$rows[$r][$c] } }
    $wb.SaveAs($Book, 51)
  } else {
    $wb = $xl.Workbooks.Open($Book)
    $s = $wb.Worksheets.Item(1)
    switch ($Op) {
      'value' { $s.Range('A3').Value2 = '得意先コード' }
      'insert-row-inside' { [void]$s.Rows.Item(3).Insert(); $s.Range('A3').Value2 = '挿入した項目'; $s.Range('B3').Value2 = '文字'; $s.Range('C3').Value2 = '○' }
      'append-row-outside' { $s.Range('A5').Value2 = '追記した項目'; $s.Range('B5').Value2 = '文字'; $s.Range('C5').Value2 = '○' }
      'delete-row-below' { [void]$s.Rows.Item(5).Delete() }
      'rename-header' { $s.Range('A1').Value2 = '項目名称' }
      'rename-sheet' { $s.Name = '画面項目' }
      'add-sheet' {
        $n = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)); $n.Name = '新しい表'
        $rows = @(@('コード','名称'), @('01','受付'), @('02','完了'))
        for ($r = 0; $r -lt $rows.Count; $r++) { for ($c = 0; $c -lt 2; $c++) { $n.Cells.Item($r + 1, $c + 1).NumberFormat = '@'; $n.Cells.Item($r + 1, $c + 1).Value2 = [string]$rows[$r][$c] } }
      }
      default { throw "unknown op $Op" }
    }
    $wb.Save()
  }
  $wb.Close($false)
} finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
