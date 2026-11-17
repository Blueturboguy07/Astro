# O2 (Windows): uninstall through the Add/Remove Programs path. Row O2-W-16.
# Uses QuietUninstallString WITHOUT _?= : NSIS copies itself to %TEMP%,
# relaunches and returns at once, so poll for the files to go.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\rows.ps1')

$installDir = Join-Path $env:ProgramFiles 'Astro'
$uninstKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Astro'
$appKey = 'HKLM:\Software\Astro'
$smDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Astro'
$deskLnk = Join-Path $env:PUBLIC 'Desktop\Astro.lnk'

Invoke-Row 'O2-W-16' 'Uninstall via QuietUninstallString' `
  'QuietUninstallString removes Program Files\Astro, the Start-menu folder and desktop shortcut, and the ARP + HKLM\Software\Astro keys within 60 s; list what stays (user data)' {
  param($dir)
  Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -and $_.Path.StartsWith($installDir, 'OrdinalIgnoreCase') } catch { $false } } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  if (-not (Test-Path $uninstKey)) { throw "no ARP key: Astro is not installed (O2-W-03 failed?)" }
  $quiet = (Get-ItemProperty $uninstKey).QuietUninstallString
  if (-not $quiet) { throw 'no QuietUninstallString' }
  $t0 = Get-Date
  cmd /c $quiet
  $gone = $false
  for ($i = 0; $i -lt 30; $i++) {
    if (-not (Test-Path $installDir)) { $gone = $true; break }
    Start-Sleep -Seconds 2
  }
  $secs = [Math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
  $check = [ordered]@{
    installDirGone = -not (Test-Path $installDir)
    installDirLeft = if (Test-Path $installDir) { @(Get-ChildItem -Recurse -LiteralPath $installDir | Select-Object -First 50 | ForEach-Object FullName) } else { @() }
    startMenuGone = -not (Test-Path $smDir)
    desktopLnkGone = -not (Test-Path $deskLnk)
    arpKeyGone = -not (Test-Path $uninstKey)
    appKeyGone = -not (Test-Path $appKey)
  }
  # What stays behind: user data and per-user registry the browser wrote.
  $left = [ordered]@{}
  foreach ($p in @("$env:LOCALAPPDATA\BrowserOS", "$env:LOCALAPPDATA\Astro", "$env:APPDATA\BrowserOS", "$env:APPDATA\Astro", "$env:USERPROFILE\.browseros")) {
    if (Test-Path $p) { $left[$p] = '{0:N1} MB' -f ((Get-ChildItem -Recurse -File -LiteralPath $p -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB) }
  }
  foreach ($k in @('HKCU:\Software\BrowserOS', 'HKCU:\Software\Astro', 'HKLM:\Software\BrowserOS', 'HKCU:\Software\Clients\StartMenuInternet', 'HKLM:\Software\Clients\StartMenuInternet')) {
    if (Test-Path $k) { $left[$k] = (@(Get-ChildItem $k -Recurse -ErrorAction SilentlyContinue | ForEach-Object Name) + @((Get-Item $k).GetValueNames())) -join '; ' }
  }
  $check.leftBehind = $left
  Save-Json $check (Join-Path $dir 'uninstall.json')
  $problems = @($check.GetEnumerator() | Where-Object { $_.Key -like '*Gone' -and -not $_.Value } | ForEach-Object Key)
  @{
    Result   = if ($problems.Count -eq 0) { 'pass' } else { 'fail' }
    Actual   = "ran '$quiet'; waited $secs s; " + $(if ($problems) { "NOT removed: $($problems -join ', ')" } else { 'program files, shortcuts, ARP and HKLM\Software\Astro removed' }) + "; left behind: " + $(if ($left.Count) { ($left.GetEnumerator() | ForEach-Object { "$($_.Key) [$($_.Value)]" }) -join ', ' } else { 'nothing' })
    Notes    = 'User data (profiles) staying after uninstall is the Chromium norm; a "delete my data" option does not exist in this installer.'
    Evidence = @('uninstall.json')
  }
}
exit 0
