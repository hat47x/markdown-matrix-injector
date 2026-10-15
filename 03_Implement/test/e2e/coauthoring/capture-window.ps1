# Saves a PNG of one VS Code window, picked by a fragment of its title (the e2e workspace folder name),
# so other VS Code windows on the machine are never captured. Used for the visual check of issue-0211.
# PrintWindow renders the window itself, so it need not be in front; if that yields a blank image, the
# window is brought to the front and the screen rectangle is copied instead.
param([Parameter(Mandatory)][string]$TitleLike, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MmiWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
# Without this, a display scaled above 100% reports a smaller window rectangle and the bottom/right is cropped.
[void][MmiWin]::SetProcessDPIAware()
$proc = Get-Process -Name 'Code', 'Code - Insiders' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$TitleLike*" } |
  Select-Object -First 1
if (-not $proc) { throw "no VS Code window with a title like *$TitleLike*" }
$h = $proc.MainWindowHandle
[void][MmiWin]::ShowWindow($h, 9)
$r = New-Object MmiWin+RECT
[void][MmiWin]::GetWindowRect($h, [ref]$r)
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { throw "window has no size ($w x $ht)" }

function Test-Blank([System.Drawing.Bitmap]$b) {
  $seen = New-Object 'System.Collections.Generic.HashSet[int]'
  for ($i = 0; $i -lt 40; $i++) { [void]$seen.Add($b.GetPixel([int]($b.Width * ($i + 0.5) / 40), [int]($b.Height * (($i * 7 % 40) + 0.5) / 40)).ToArgb()) }
  return $seen.Count -le 2
}

$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[void][MmiWin]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc); $g.Dispose()
$how = 'PrintWindow'
if (Test-Blank $bmp) {
  $bmp.Dispose()
  [void][MmiWin]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 700
  [void][MmiWin]::GetWindowRect($h, [ref]$r)
  $bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $g.Dispose()
  $how = 'CopyFromScreen'
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"$how $Out ${w}x$ht"
