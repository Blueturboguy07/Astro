# Run by Astro-Update.exe (astro-win.nsi, UPDATER) with admin rights.
#   -Action close -InstallDir <dir>              close every process that runs from <dir>
#   -Action prune -InstallDir <dir> -Keep <ver>  remove Chromium version folders other than <ver>
# Exit 0 on success.
param(
  [Parameter(Mandatory = $true)][ValidateSet('close', 'prune')][string]$Action,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [string]$Keep = ''
)
$dir = $InstallDir.TrimEnd('\') + '\'

function Get-Mine {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      try { $_.Path -and $_.Path.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
    })
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
    $left | Stop-Process -Force -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Mine).Count -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  }
  $left = Get-Mine
  if ($left.Count -gt 0) {
    Write-Output "astro-update: still running: $(($left | ForEach-Object { "$($_.Name)($($_.Id))" }) -join ', ')"
    exit 1
  }
  Write-Output 'astro-update: Astro is closed'
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
