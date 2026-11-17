# Windows desktop helper for the Astro QA harness.
#
# Runs under Windows PowerShell 5.1 (powershell.exe), which always has
# System.Windows.Forms, System.Drawing, UIAutomationClient and
# Microsoft.VisualBasic. Every action prints ONE line of JSON on stdout so
# lib/win.mjs can parse it.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File win.ps1 -Action shot -Out C:\x.png
#
# Actions: shot, windows, procs, cmdlines, listen, apperrors, close, focus, keys, uia-click, uia-dump,
#          netsample, dns, dns-clear, lnk, verinfo, reg
param(
  [Parameter(Mandatory = $true)][string]$Action,
  [string]$Out = '',
  [string]$Root = "$env:ProgramFiles\Astro",
  [string]$Keys = '',
  [string]$Name = '',
  [string]$Path = '',
  [string]$StopFile = '',
  [int]$TimeoutSec = 20
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class QaWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  public static List<IntPtr> TopWindows() {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static string Text(IntPtr h) { var s = new StringBuilder(1024); GetWindowText(h, s, 1024); return s.ToString(); }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  public static void Foreground(IntPtr h) {
    // ALT tap releases the foreground lock for this process.
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    ShowWindow(h, 9);
    BringWindowToTop(h);
    SetForegroundWindow(h);
  }
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(0x02, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x04, 0, 0, 0, UIntPtr.Zero);
  }
}
'@

function Emit($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  [Console]::Out.WriteLine($json)
}

function Get-ProcInfo {
  $map = @{}
  foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
    $path = $null
    try { $path = $p.Path } catch { }
    $map[[uint32]$p.Id] = @{ name = $p.ProcessName; path = $path }
  }
  return $map
}

function Get-QaWindows {
  $procs = Get-ProcInfo
  $out = @()
  foreach ($h in [QaWin]::TopWindows()) {
    $procId = [QaWin]::Pid($h)
    $info = $procs[[uint32]$procId]
    $out += [ordered]@{
      hwnd  = [int64]$h
      pid   = [int]$procId
      name  = if ($info) { $info.name } else { '' }
      path  = if ($info) { $info.path } else { '' }
      class = [QaWin]::Cls($h)
      title = [QaWin]::Text($h)
    }
  }
  return $out
}

function Get-AppWindows {
  # Windows owned by a process that runs from the install dir.
  return @(Get-QaWindows | Where-Object { $_.path -and $_.path.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) })
}

function Focus-App {
  $wins = @(Get-AppWindows | Where-Object { $_.title -and $_.class -like 'Chrome_WidgetWin*' })
  if ($wins.Count -eq 0) { return $null }
  $w = $wins[0]
  [QaWin]::Foreground([IntPtr]$w.hwnd)
  Start-Sleep -Milliseconds 400
  return $w
}

switch ($Action) {
  'shot' {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Emit @{ ok = $true; out = $Out; width = $b.Width; height = $b.Height }
  }
  'windows' {
    Emit @(Get-QaWindows)
  }
  'procs' {
    $rows = @()
    foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
      $path = $null
      try { $path = $p.Path } catch { }
      if (-not $path) { continue }
      if (-not $path.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $vi = $null
      try { $vi = (Get-Item -LiteralPath $path).VersionInfo } catch { }
      $rows += [ordered]@{
        pid = $p.Id; name = $p.ProcessName; path = $path
        description = if ($vi) { $vi.FileDescription } else { '' }
        product = if ($vi) { $vi.ProductName } else { '' }
        company = if ($vi) { $vi.CompanyName } else { '' }
        mainWindowTitle = $p.MainWindowTitle
      }
    }
    Emit @($rows)
  }
  'cmdlines' {
    # Command lines of the app's processes (shows the user data dir in use).
    $rows = @()
    foreach ($p in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
      $exe = [string]$p.ExecutablePath
      if (-not $exe -or -not $exe.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $rows += [ordered]@{ pid = [int]$p.ProcessId; ppid = [int]$p.ParentProcessId; name = [string]$p.Name; cmd = [string]$p.CommandLine }
    }
    Emit @($rows)
  }
  'listen' {
    # Listening TCP sockets of the app's processes (address + port).
    $ids = @{}
    foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
      $pp = $null
      try { $pp = $p.Path } catch { }
      if ($pp -and $pp.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $ids[[int]$p.Id] = $p.ProcessName }
    }
    $rows = @()
    foreach ($c in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) {
      if ($ids.ContainsKey([int]$c.OwningProcess)) {
        $rows += [ordered]@{ address = [string]$c.LocalAddress; port = [int]$c.LocalPort; pid = [int]$c.OwningProcess; name = $ids[[int]$c.OwningProcess] }
      }
    }
    Emit @($rows)
  }
  'apperrors' {
    # Application-log crash events (Application Error / WER) of the last TimeoutSec seconds.
    $since = (Get-Date).AddSeconds(-1 * [Math]::Max($TimeoutSec, 60))
    $rows = @()
    try {
      $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $since } -ErrorAction SilentlyContinue |
        Where-Object { $_.ProviderName -in @('Application Error', 'Windows Error Reporting', 'Application Hang') })
      foreach ($e in $ev) {
        $msg = [string]$e.Message
        if ($msg -notmatch '(?i)chrome|browseros|astro') { continue }
        $rows += [ordered]@{ time = $e.TimeCreated.ToString('o'); id = [int]$e.Id; provider = [string]$e.ProviderName; message = $msg.Substring(0, [Math]::Min(900, $msg.Length)) }
      }
    } catch { }
    Emit @($rows)
  }
  'close' {
    # The way a person quits: close every top-level window (WM_CLOSE).
    $wins = @(Get-AppWindows | Where-Object { $_.class -like 'Chrome_WidgetWin*' -and $_.title })
    foreach ($w in $wins) { [void][QaWin]::PostMessage([IntPtr]$w.hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
    Emit @{ closed = $wins.Count; titles = @($wins | ForEach-Object { $_.title }) }
  }
  'focus' {
    $w = Focus-App
    $fg = [QaWin]::GetForegroundWindow()
    Emit @{ focused = [bool]$w; window = $w; foregroundTitle = [QaWin]::Text($fg) }
  }
  'keys' {
    Add-Type -AssemblyName System.Windows.Forms
    $w = Focus-App
    if (-not $w) { Emit @{ ok = $false; error = 'no app window to focus' }; break }
    $fg = [QaWin]::GetForegroundWindow()
    $fgTitle = [QaWin]::Text($fg)
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Emit @{ ok = $true; window = $w.title; foregroundTitle = $fgTitle }
  }
  'uia-click' {
    # Find a control by its accessible name inside the app's windows and
    # press it: InvokePattern first, a real mouse click as the fallback.
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $hit = $null
    while ((Get-Date) -lt $deadline -and -not $hit) {
      foreach ($w in (Get-AppWindows)) {
        try {
          $el = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$w.hwnd)
          $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
          $found = $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
          if ($found -and $found.Current.IsEnabled) { $hit = @{ el = $found; win = $w }; break }
        } catch { }
      }
      if (-not $hit) { Start-Sleep -Milliseconds 700 }
    }
    if (-not $hit) { Emit @{ ok = $false; error = "no enabled control named '$Name' within $TimeoutSec s" }; break }
    $how = ''
    try {
      $ip = $hit.el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $ip.Invoke(); $how = 'invoke'
    } catch {
      $r = $hit.el.Current.BoundingRectangle
      [QaWin]::Foreground([IntPtr]$hit.win.hwnd)
      [QaWin]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)); $how = 'mouse'
    }
    Emit @{ ok = $true; how = $how; window = $hit.win.title; control = $hit.el.Current.ControlType.ProgrammaticName }
  }
  'uia-dump' {
    # Names of buttons/dialogs/text in the app windows (native dialogs).
    # Bounded walk: a browser window's web content can hold thousands of nodes.
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $script:uiaRows = @()
    function Walk($el, [int]$depth, $title, $sw) {
      if ($depth -gt 10 -or $script:n -ge 500 -or $sw.Elapsed.TotalSeconds -gt 15) { return }
      $c = $walker.GetFirstChild($el)
      while ($null -ne $c -and $script:n -lt 500 -and $sw.Elapsed.TotalSeconds -le 15) {
        $script:n++
        try {
          $nm = $c.Current.Name
          if ($nm) { $script:uiaRows += [ordered]@{ window = $title; type = $c.Current.ControlType.ProgrammaticName; name = $nm } }
        } catch { }
        Walk $c ($depth + 1) $title $sw
        $c = $walker.GetNextSibling($c)
      }
    }
    foreach ($w in (Get-AppWindows)) {
      try {
        $script:n = 0
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $el = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$w.hwnd)
        $script:uiaRows += [ordered]@{ window = $w.title; type = 'window'; name = $el.Current.Name }
        Walk $el 0 $w.title $sw
      } catch { }
    }
    Emit @($script:uiaRows)
  }
  'netsample' {
    # Sample established TCP connections of the app's processes until $StopFile exists.
    while (-not (Test-Path $StopFile)) {
      $ids = @{}
      foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
        $pp = $null
        try { $pp = $p.Path } catch { }
        if ($pp -and $pp.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $ids[[uint32]$p.Id] = $p.ProcessName }
      }
      $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        if (-not $ids.ContainsKey([uint32]$c.OwningProcess)) { continue }
        $ra = [string]$c.RemoteAddress
        if ($ra -in @('0.0.0.0', '::', '127.0.0.1', '::1')) { continue }
        $line = ConvertTo-Json -Compress -InputObject ([ordered]@{ t = $now; pid = [int]$c.OwningProcess; name = $ids[[uint32]$c.OwningProcess]; ra = $ra; rp = [int]$c.RemotePort; state = [string]$c.State })
        Add-Content -LiteralPath $Out -Value $line
      }
      Start-Sleep -Seconds 2
    }
    Emit @{ ok = $true }
  }
  'dns' {
    $rows = @()
    foreach ($d in (Get-DnsClientCache -ErrorAction SilentlyContinue)) {
      $rows += [ordered]@{ name = [string]$d.Entry; data = [string]$d.Data; type = [int]$d.Type; status = [int]$d.Status }
    }
    Emit @($rows)
  }
  'dns-clear' {
    Clear-DnsClientCache
    Emit @{ ok = $true }
  }
  'lnk' {
    $sh = New-Object -ComObject WScript.Shell
    if (-not (Test-Path -LiteralPath $Path)) { Emit @{ exists = $false; path = $Path }; break }
    $l = $sh.CreateShortcut($Path)
    Emit ([ordered]@{ exists = $true; path = $Path; name = [IO.Path]::GetFileNameWithoutExtension($Path); target = $l.TargetPath; arguments = $l.Arguments; workingDirectory = $l.WorkingDirectory; icon = $l.IconLocation; description = $l.Description })
  }
  'verinfo' {
    $vi = (Get-Item -LiteralPath $Path).VersionInfo
    Emit ([ordered]@{ path = $Path; ProductName = $vi.ProductName; FileDescription = $vi.FileDescription; CompanyName = $vi.CompanyName; FileVersion = $vi.FileVersion; ProductVersion = $vi.ProductVersion; LegalCopyright = $vi.LegalCopyright; OriginalFilename = $vi.OriginalFilename; InternalName = $vi.InternalName })
  }
  'reg' {
    # Dump every value under a registry key (and subkeys), e.g. HKCU:\Software\BrowserOS
    if (-not (Test-Path $Path)) { Emit @{ exists = $false; path = $Path }; break }
    $rows = @()
    foreach ($k in @(Get-Item $Path) + @(Get-ChildItem $Path -Recurse -ErrorAction SilentlyContinue)) {
      $vals = [ordered]@{}
      foreach ($v in $k.GetValueNames()) { $vals[$v] = [string]$k.GetValue($v) }
      $rows += [ordered]@{ key = $k.Name; values = $vals }
    }
    Emit @{ exists = $true; path = $Path; keys = @($rows) }
  }
  default { throw "unknown action $Action" }
}
