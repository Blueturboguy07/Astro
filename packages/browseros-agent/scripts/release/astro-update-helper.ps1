# Run by Astro-Setup.exe and Astro-Update.exe (astro-win.nsi).
#   -Action close -InstallDir <dir>              close every process that runs from <dir>, then
#                                                check that every .exe/.dll there can be written
#                 [-SkipWriteCheck]              (not that check: the old copy in Program Files,
#                                                closed without admin rights, stays as it is)
#   -Action prune -InstallDir <dir> -Keep <ver>  remove Chromium version folders other than <ver>
# Exit 0 on success.
param(
  [Parameter(Mandatory = $true)][ValidateSet('close', 'prune')][string]$Action,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [string]$Keep = '',
  [switch]$SkipWriteCheck
)
$dir = $InstallDir.TrimEnd('\') + '\'

# Every process that runs from the install folder. Through WMI, not
# Get-Process: the update package is a 32-bit program, so this script runs in
# 32-bit PowerShell, where Get-Process cannot read the path of a 64-bit
# process (proof run 44608751570: no process found, every file in use).
function Get-Mine {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase)
    } | ForEach-Object { [pscustomobject]@{ Id = [int]$_.ProcessId; Name = $_.Name } })
}

if ($Action -eq 'close') {
  # Politely first: WM_CLOSE to every window (taskkill without /F), so Astro
  # shuts down like a normal quit and restores the session next start.
  foreach ($p in Get-Mine) { & taskkill.exe /PID $p.Id 2>$null | Out-Null }
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Mine).Count -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  $left = Get-Mine
  if ($left.Count -gt 0) {
    Write-Output "astro-update: $($left.Count) process(es) still running after 30 s; stopping them"
    foreach ($p in $left) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Mine).Count -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  }
  $left = Get-Mine
  if ($left.Count -gt 0) {
    Write-Output "astro-update: still running: $(($left | ForEach-Object { "$($_.Name)($($_.Id))" }) -join ', ')"
    exit 1
  }
  if ($SkipWriteCheck) { Write-Output 'astro-update: Astro is closed'; exit 0 }
  # A silent NSIS copy skips a file it cannot open and goes on (a half-updated
  # Astro). So before any file is written, every .exe and .dll of the install
  # must open for exclusive writing; wait up to 15 s for a scanner to let go.
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $locked = @()
    foreach ($f in Get-ChildItem $dir -Recurse -File -Include *.exe, *.dll -ErrorAction SilentlyContinue) {
      try { $h = [IO.File]::Open($f.FullName, 'Open', 'ReadWrite', 'None'); $h.Close() } catch { $locked += $f.FullName }
    }
    if ($locked.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  if ($locked.Count -gt 0) {
    Write-Output "astro-update: files still in use, nothing written: $($locked[0..4] -join ', ')"
    exit 1
  }
  Write-Output 'astro-update: Astro is closed and its files can be written'
  exit 0
}

if ($Action -eq 'prune') {
  if (-not ($Keep -match '^\d+(\.\d+){3}$')) { Write-Output "astro-update: bad -Keep '$Keep'"; exit 1 }
  if (-not (Test-Path (Join-Path $dir $Keep))) { Write-Output "astro-update: $Keep is not installed; nothing removed"; exit 1 }
  Get-ChildItem $dir -Directory | Where-Object { $_.Name -match '^\d+(\.\d+){3}$' -and $_.Name -ne $Keep } | ForEach-Object {
    Write-Output "astro-update: removing old version folder $($_.Name)"
    Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
  }
  exit 0
}
