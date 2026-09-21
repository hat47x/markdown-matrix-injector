#requires -Version 5.1
<#
  Answers the open question in
  02_Architecture/input-assistance-paste-provenance.md §2: which DataTransfer
  MIME types does a VS Code paste provider actually receive from a real Excel
  range copy?

  It launches an isolated VS Code (its own --user-data-dir and
  --extensions-dir, so the developer's profile is untouched), loads the
  observation extension in ext/, copies a range in real Excel, then drops a
  trigger file. The extension performs the paste itself on the dedicated
  paste-target document -- no keystrokes are injected, so nothing can land in
  an unrelated window.

  Review R5: SUCCESS REQUIRES provideDocumentPasteEdits TO HAVE BEEN CALLED and
  its MIME list recorded. Activation, or a paste that merely inserted text, is
  not a result. This script exits non-zero when the provider was not invoked,
  and a failed observation must NOT be reported as "no provenance formats".

  Run build-books.ps1 first. Save as UTF-8 WITH BOM.

  Known blocker: if VS Code has a pending update it holds the `vscode-updating`
  mutex and refuses to start a second instance ("Code is currently being
  updated"). Restart VS Code to let the update finish, then re-run.
#>
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$probeRoot = if ($env:MMI_PROBE_DIR) { $env:MMI_PROBE_DIR } else { Join-Path $env:TEMP 'mmi-clipboard-probe' }
$books = Join-Path $probeRoot 'books'
if (-not (Test-Path $books)) { throw "run build-books.ps1 first (no $books)" }

$codeExe = if ($env:MMI_PROBE_CODE_EXE) { $env:MMI_PROBE_CODE_EXE }
           else { "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" }
if (-not (Test-Path $codeExe)) { throw "VS Code not found at $codeExe (set MMI_PROBE_CODE_EXE)" }

$env:MMI_PROBE_DIR = $probeRoot
$logPath = Join-Path $probeRoot 'vscode-probe.log'
$trigger = Join-Path $probeRoot 'trigger.json'
$target  = Join-Path $probeRoot 'paste-target.md'
Remove-Item $logPath, $trigger -Force -ErrorAction SilentlyContinue
Set-Content -Path $target -Value "# paste target" -Encoding UTF8

# Record the host versions alongside the result. The minimum supported VS Code
# is declared as ^1.96.0; observe on that build too before concluding.
$hostInfo = [ordered]@{
  observedAt = (Get-Date).ToString('o')
  codeExe    = $codeExe
  codeVersion = (& $codeExe --version 2>&1 | Select-Object -First 1)
  os         = (Get-CimInstance Win32_OperatingSystem).Caption
  osVersion  = [System.Environment]::OSVersion.Version.ToString()
}
$hostInfo | ConvertTo-Json | Out-File (Join-Path $probeRoot 'vscode-probe-host.json') -Encoding utf8

$codeArgs = @(
  '--user-data-dir', (Join-Path $probeRoot 'vscode-user'),
  '--extensions-dir', (Join-Path $probeRoot 'vscode-ext'),
  '--disable-workspace-trust', '--skip-release-notes', '--disable-telemetry',
  '--extensionDevelopmentPath', (Join-Path $here 'ext'),
  '--new-window', $target
)
$proc = Start-Process -FilePath $codeExe -ArgumentList $codeArgs -PassThru
"launched isolated VS Code pid=$($proc.Id)"

$activated = $false
for ($i = 0; $i -lt 60 -and -not $activated; $i++) {
  Start-Sleep -Seconds 2
  $activated = (Test-Path $logPath) -and (Select-String -Path $logPath -Pattern '"kind": "activate"' -Quiet)
}
if (-not $activated) {
  throw "probe extension did not activate. Check $logPath and $probeRoot\vscode-user\logs (a pending VS Code update blocks a second instance)."
}
"probe extension activated (activation alone is NOT the result)"

$caseId = 'vscode-01_状態遷移_C5F12'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $true
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open((Join-Path $books '設計.xlsx'))
  $ws = $wb.Worksheets.Item('状態遷移')
  $ws.Activate()
  $ws.Range('C5:F12').Copy() | Out-Null
  Start-Sleep -Milliseconds 800
  "copied 状態遷移!C5:F12  (case $caseId)"

  # Excel must stay alive: it renders clipboard formats on demand.
  @{ caseId = $caseId; mode = 'command' } | ConvertTo-Json -Compress |
    Out-File -FilePath $trigger -Encoding utf8
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Select-String -Path $logPath -Pattern '"kind": "pasted"' -Quiet) { break }
  }
}
finally {
  try { $excel.Workbooks | ForEach-Object { $_.Close($false) } } catch {}
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
}

Start-Sleep -Seconds 1
$providerCalled = Select-String -Path $logPath -Pattern '"kind": "provider-called"' -Quiet

""
"=== MIME types received ==="
Select-String -Path $logPath -Pattern '"mimes"' -Context 0, 14 |
  ForEach-Object { $_.Line; $_.Context.PostContext }

""
if (-not $providerCalled) {
  Write-Warning @'
provideDocumentPasteEdits was NEVER called. This observation FAILED.
Do NOT record this as "VS Code exposes no provenance formats" -- it says
nothing about the MIME list. Investigate the provider registration, the
paste route (command vs. real keystroke) and the host version, then re-run.
'@
  "log: $logPath"
  exit 2
}

"provideDocumentPasteEdits was called. MIME list above is the observation result."
"log: $logPath"
"host: $probeRoot\vscode-probe-host.json"
""
"NEXT: repeat on the declared minimum host (VS Code 1.96.x) via MMI_PROBE_CODE_EXE,"
"and repeat with a real Ctrl+V keystroke to confirm the command route matches."
"close the isolated VS Code window when finished."
