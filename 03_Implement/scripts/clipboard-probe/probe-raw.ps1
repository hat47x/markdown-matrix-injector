#requires -Version 5.1
<#
  Captures the exact bytes Excel publishes on the Windows clipboard for each
  test selection. Run build-books.ps1 first.

  Raw Win32 access is deliberate: .NET's DataObject string conversion
  mis-decodes these formats (CF_HTML is UTF-8 but gets ANSI-decoded; Csv and
  Link are ANSI but get UTF-8-decoded into U+FFFD), so it cannot be used as
  evidence. Decode per format with summarize.cjs.

  Read-only with respect to the workbooks. It does overwrite the clipboard --
  that is inherent to observing a copy. Save as UTF-8 WITH BOM.
#>
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MmiClip {
  [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr h);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseClipboard();
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr GetClipboardData(uint f);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormatW(string name);
  [DllImport("user32.dll", SetLastError=true)] static extern uint EnumClipboardFormats(uint f);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern int GetClipboardFormatNameW(uint f, System.Text.StringBuilder n, int max);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
  [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);

  // OpenClipboard fails with ERROR_ACCESS_DENIED (5) while another process
  // holds the clipboard open. Observed lasting minutes, so retry then give up.
  static bool Open() {
    for (int i = 0; i < 25; i++) {
      if (OpenClipboard(IntPtr.Zero)) return true;
      System.Threading.Thread.Sleep(120);
    }
    return false;
  }

  public static string LastOpenError = "";

  public static byte[] Read(string name) {
    uint fmt = RegisterClipboardFormatW(name);
    if (fmt == 0) return null;
    if (!Open()) { LastOpenError = "OpenClipboard failed err=" + Marshal.GetLastWin32Error(); return null; }
    try {
      IntPtr h = GetClipboardData(fmt);
      if (h == IntPtr.Zero) return null;
      IntPtr p = GlobalLock(h);
      if (p == IntPtr.Zero) return null;
      try { int len = (int)GlobalSize(h); byte[] b = new byte[len]; Marshal.Copy(p, b, 0, len); return b; }
      finally { GlobalUnlock(h); }
    } finally { CloseClipboard(); }
  }

  public static string[] List() {
    if (!Open()) return new string[] { "OpenClipboard failed err=" + Marshal.GetLastWin32Error() };
    try {
      var res = new System.Collections.Generic.List<string>();
      uint f = 0;
      while ((f = EnumClipboardFormats(f)) != 0) {
        var sb = new System.Text.StringBuilder(256);
        int n = GetClipboardFormatNameW(f, sb, 256);
        res.Add(n > 0 ? sb.ToString() : ("#" + f));
      }
      return res.ToArray();
    } finally { CloseClipboard(); }
  }
}
'@

$probeRoot = if ($env:MMI_PROBE_DIR) { $env:MMI_PROBE_DIR } else { Join-Path $env:TEMP 'mmi-clipboard-probe' }
$books = Join-Path $probeRoot 'books'
$raw   = Join-Path $probeRoot 'raw'
if (-not (Test-Path $books)) { throw "run build-books.ps1 first (no $books)" }
New-Item -ItemType Directory -Force -Path $raw | Out-Null

# Formats worth keeping. The provenance lives in Link / Object Descriptor;
# HTML Format is what VS Code is expected to receive.
$NAMED = @('HTML Format', 'Link', 'Object Descriptor', 'Link Source Descriptor',
           'Csv', 'XML Spreadsheet', 'Hyperlink', 'SymbolicLink')

function Dump([string]$label) {
  Start-Sleep -Milliseconds 500
  $dir = Join-Path $raw $label
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  ([MmiClip]::List() -join "`n") | Out-File (Join-Path $dir '_formats.txt') -Encoding utf8
  $kept = @()
  foreach ($n in $NAMED) {
    $b = [MmiClip]::Read($n)
    if ($null -ne $b) {
      [System.IO.File]::WriteAllBytes((Join-Path $dir (($n -replace '[^A-Za-z0-9]', '_') + '.bin')), $b)
      $kept += "$n($($b.Length)B)"
    }
  }
  if ($kept.Count -eq 0) { "  $label -> NOTHING CAPTURED. $([MmiClip]::LastOpenError)" }
  else { "  $label -> $($kept -join ', ')" }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $true          # match the real user flow
$excel.DisplayAlerts = $false
try {
  $wbA = $excel.Workbooks.Open((Join-Path $books '設計.xlsx'))

  # 01 flagship: non-A1 origin, mid-table blank row, mixed cell types
  $ws = $wbA.Worksheets.Item('状態遷移'); $ws.Activate()
  $ws.Range('C5:F12').Copy() | Out-Null
  Dump '01_状態遷移_C5F12'

  # 02 identical values on another sheet -> content matching is ambiguous
  $wbA.Worksheets.Item('重複').Activate()
  $wbA.Worksheets.Item('重複').Range('C5:F12').Copy() | Out-Null
  Dump '02_重複_C5F12'

  # 03 A1 origin with a horizontal merge (colspan)
  $wbA.Worksheets.Item('A1開始').Activate()
  $wbA.Worksheets.Item('A1開始').Range('A1:B4').Copy() | Out-Null
  Dump '03_A1開始_A1B4_横結合'

  # 04 vertical merge (rowspan)
  $wbA.Worksheets.Item('縦結合').Activate()
  $wbA.Worksheets.Item('縦結合').Range('B2:C4').Copy() | Out-Null
  Dump '04_縦結合_B2C4'

  # 05 single cell
  $ws.Activate()
  $ws.Range('D7').Copy() | Out-Null
  Dump '05_単一セル_D7'

  # 06 single row -- Excel puts <tr> OUTSIDE the fragment markers here
  $ws.Range('C6:F6').Copy() | Out-Null
  Dump '06_単一行_C6F6'

  # 07 non-contiguous selection
  $ws.Range('C5:F5,C7:F7').Copy() | Out-Null
  Dump '07_非連続_C5F5_C7F7'

  # 08 whole columns -> address comes back as the R1C1 column-only form
  $ws.Range('C:D').Copy() | Out-Null
  Dump '08_列全体_CD'

  # 09 AutoFilter: copied shape is smaller than the reported address
  $ws.Range('C5:F8').AutoFilter(4, '合格') | Out-Null
  $ws.Range('C5:F8').Copy() | Out-Null
  Dump '09_フィルター可視行_C5F8'
  $ws.AutoFilterMode = $false

  # 10 path with a space and Japanese
  $wbB = $excel.Workbooks.Open((Join-Path $books '設計 控え.xlsx'))
  $wbB.Worksheets.Item('状態遷移').Activate()
  $wbB.Worksheets.Item('状態遷移').Range('C5:F12').Copy() | Out-Null
  Dump '10_空白入りパス_C5F12'

  # 11 path with a character outside the Japanese ANSI code page
  $wbC = $excel.Workbooks.Open((Join-Path $books '設計_한글.xlsx'))
  $wbC.Worksheets.Item('状態遷移').Activate()
  $wbC.Worksheets.Item('状態遷移').Range('C5:F12').Copy() | Out-Null
  Dump '11_非ANSIパス_C5F12'

  # 12 never-saved workbook -> no SourceURL, Link target has no directory
  $wbNew = $excel.Workbooks.Add()
  $wsNew = $wbNew.Worksheets.Item(1)
  $wsNew.Range('B3').Formula = '未保存'
  $wsNew.Range('C3').Formula = '値'
  $wsNew.Range('B3:C3').Copy() | Out-Null
  Dump '12_未保存ブック_B3C3'

  # 13 copy, then change and SAVE the source row, so the dumped clipboard is
  # genuinely stale against the file on disk. Asserting that the reconciliation
  # step rejects it belongs to issue-0114's tests, not to this capture.
  # Runs last: it modifies the fixture. Re-run build-books.ps1 to reset.
  $ws.Activate()
  $ws.Range('C6:F6').Copy() | Out-Null
  Dump '13_コピー後に原本変更_C6F6'
  $ws.Range('D6').Formula = '申請(改)'
  $wbA.Save()
  "  (原本のD6を'申請(改)'へ変更して保存済み。クリップボードは変更前の値を保持)"

  ""
  "raw dumps: $raw"
  "next: summarize.cjs"
}
finally {
  try { $excel.Workbooks | ForEach-Object { $_.Close($false) } } catch {}
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
}
