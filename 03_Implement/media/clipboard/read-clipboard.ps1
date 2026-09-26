# Reads the raw bytes of the clipboard formats MMI needs to identify an Excel
# copy (ADR-0017 option 2) and prints one JSON line. Read-only: it never
# writes the clipboard, never touches Excel, and keeps nothing.
#
# Raw Win32 access is deliberate: .NET's DataObject string conversion
# mis-decodes these formats (CF_HTML is UTF-8, Object Descriptor is binary).
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MmiClipboardRead {
  [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr h);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseClipboard();
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr GetClipboardData(uint f);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormatW(string name);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
  [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);
  const uint CF_UNICODETEXT = 13;

  static byte[] ReadOpen(uint format) {
    IntPtr h = GetClipboardData(format);
    if (h == IntPtr.Zero) return null;
    IntPtr p = GlobalLock(h);
    if (p == IntPtr.Zero) return null;
    try { int len = (int)GlobalSize(h); byte[] b = new byte[len]; Marshal.Copy(p, b, 0, len); return b; }
    finally { GlobalUnlock(h); }
  }

  // All three formats in ONE open, so they describe the same copy.
  public static string[] ReadAll() {
    bool open = false;
    // OpenClipboard fails with ERROR_ACCESS_DENIED while another process holds it; bounded retry.
    for (int i = 0; i < 10 && !open; i++) { open = OpenClipboard(IntPtr.Zero); if (!open) System.Threading.Thread.Sleep(50); }
    if (!open) return null;
    try {
      byte[] html = ReadOpen(RegisterClipboardFormatW("HTML Format"));
      byte[] od = ReadOpen(RegisterClipboardFormatW("Object Descriptor"));
      byte[] text = ReadOpen(CF_UNICODETEXT);
      return new string[] {
        html == null ? null : Convert.ToBase64String(html),
        od == null ? null : Convert.ToBase64String(od),
        text == null ? null : Convert.ToBase64String(text),
      };
    } finally { CloseClipboard(); }
  }
}
'@
function Read-MmiClipboard {
  $r = [MmiClipboardRead]::ReadAll()
  if ($null -eq $r) { return '{"error":"clipboard-busy"}' }
  return (@{ html = $r[0]; objectDescriptor = $r[1]; unicodeText = $r[2] } | ConvertTo-Json -Compress)
}

if ($args -contains '-Serve') {
  # Warm mode: compile once, then answer one JSON line per "read" request on stdin.
  [Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush()
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    # A writer may prefix a byte-order mark to the first line.
    if ($line.Trim([char]0xFEFF, ' ') -eq 'read') { [Console]::Out.WriteLine((Read-MmiClipboard)); [Console]::Out.Flush() }
  }
} else {
  Read-MmiClipboard
}
