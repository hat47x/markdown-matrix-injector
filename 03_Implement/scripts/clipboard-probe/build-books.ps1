#requires -Version 5.1
<#
  Builds the fictional workbooks used by the Excel clipboard observation.
  Windows + Microsoft Excel required. Writes only into the probe directory
  ($env:MMI_PROBE_DIR, default %TEMP%\mmi-clipboard-probe) -- never into the
  repository and never into any existing workbook.

  Save this file as UTF-8 WITH BOM. Windows PowerShell 5.1 reads .ps1 as the
  system ANSI code page otherwise and the Japanese literals below break.
#>
$ErrorActionPreference = 'Stop'

$probeRoot = if ($env:MMI_PROBE_DIR) { $env:MMI_PROBE_DIR } else { Join-Path $env:TEMP 'mmi-clipboard-probe' }
$books = Join-Path $probeRoot 'books'
New-Item -ItemType Directory -Force -Path $books | Out-Null

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

# Assign through .Formula (a String property) only. PowerShell 5.1's COM adapter
# caches the .Value2 setter signature from its first use, so a later numeric or
# DateTime assignment throws InvalidCastException.
function Set-Cell($ws, $addr, [string]$formula) { $ws.Range($addr).Formula = $formula }

try {
  # ---- Book A: 設計.xlsx --------------------------------------------------
  # 状態遷移: used range starts at C5 (non-A1 origin), header row C5:F5, body
  # C6:F12 with a genuinely blank row at row 9, plus leading-zero text, a real
  # date, a formula, an error value and an empty cell.
  $wb = $excel.Workbooks.Add()
  while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }
  $ws = $wb.Worksheets.Item(1)
  $ws.Name = '状態遷移'

  Set-Cell $ws 'C5' 'ID'
  Set-Cell $ws 'D5' '操作'
  Set-Cell $ws 'E5' '遷移後状態'
  Set-Cell $ws 'F5' '判定'
  Set-Cell $ws 'C6' 'ST-001'; Set-Cell $ws 'D6' '申請'; Set-Cell $ws 'E6' '審査中'; Set-Cell $ws 'F6' '要確認'
  Set-Cell $ws 'C7' 'ST-002'; Set-Cell $ws 'D7' '承認'; Set-Cell $ws 'E7' '承認済'; Set-Cell $ws 'F7' '合格'
  Set-Cell $ws 'C8' 'ST-003'; Set-Cell $ws 'D8' '差戻'; Set-Cell $ws 'E8' '記入中'; Set-Cell $ws 'F8' '要確認'
  # row 9 intentionally left entirely blank
  Set-Cell $ws 'C10' 'ST-004'; Set-Cell $ws 'D10' '取消'; Set-Cell $ws 'E10' '取消済'; Set-Cell $ws 'F10' '合格'
  $ws.Range('C11').NumberFormat = '@'
  Set-Cell $ws 'C11' '007'
  Set-Cell $ws 'D11' '2026/04/03'
  $ws.Range('D11').NumberFormat = 'yyyy/mm/dd'
  Set-Cell $ws 'E11' '=C7'
  Set-Cell $ws 'F11' '=1/0'
  Set-Cell $ws 'C12' 'ST-006'; Set-Cell $ws 'D12' ''; Set-Cell $ws 'E12' '完了'; Set-Cell $ws 'F12' '合格'

  # 重複: the SAME C5:F12 values again, so content matching is ambiguous
  $ws2 = $wb.Worksheets.Add()
  $ws2.Name = '重複'
  $ws.Range('C5:F12').Copy() | Out-Null
  $ws2.Range('C5').PasteSpecial(-4163) | Out-Null   # xlPasteValues

  # A1開始: used range starts at A1, with a horizontal merge at A4:B4
  $ws3 = $wb.Worksheets.Add()
  $ws3.Name = 'A1開始'
  Set-Cell $ws3 'A1' '区分'
  Set-Cell $ws3 'B1' '件数'
  Set-Cell $ws3 'A2' '甲'; Set-Cell $ws3 'B2' '1'
  Set-Cell $ws3 'A3' '乙'; Set-Cell $ws3 'B3' '2'
  $ws3.Range('A4:B4').Merge()
  Set-Cell $ws3 'A4' '合計'

  # 縦結合: vertical merge, for the rowspan case
  $ws4 = $wb.Worksheets.Add()
  $ws4.Name = '縦結合'
  Set-Cell $ws4 'B2' '区分'; Set-Cell $ws4 'C2' '値'
  Set-Cell $ws4 'B3' '甲';   Set-Cell $ws4 'C3' '1'
  Set-Cell $ws4 'C4' '2'
  $ws4.Range('B3:B4').Merge()

  $pathA = Join-Path $books '設計.xlsx'
  if (Test-Path $pathA) { Remove-Item $pathA -Force }
  $wb.SaveAs($pathA, 51)   # xlOpenXMLWorkbook
  $wb.Close($false)

  # ---- Book B: identical content, name with a space and Japanese ----------
  $wb2 = $excel.Workbooks.Open($pathA)
  $pathB = Join-Path $books '設計 控え.xlsx'
  if (Test-Path $pathB) { Remove-Item $pathB -Force }
  $wb2.SaveAs($pathB, 51)
  $wb2.Close($false)

  # ---- Book C: name with a character outside the Japanese ANSI code page --
  $wb3 = $excel.Workbooks.Open($pathA)
  $pathC = Join-Path $books '設計_한글.xlsx'
  if (Test-Path $pathC) { Remove-Item $pathC -Force }
  $wb3.SaveAs($pathC, 51)
  $wb3.Close($false)

  "probe dir: $probeRoot"
  Get-ChildItem $books | Select-Object Name, Length | Format-Table -AutoSize | Out-String
}
finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
}
