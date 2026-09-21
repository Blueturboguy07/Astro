# astro-repo-404-clone: reproduce the guide's Windows clone step exactly as
# publik's astro.ts guide (fde0b71, live at the time of the Aug 30 report)
# authored it, run through a bash-syntax POSIX idiom the way an actual
# Windows machine would receive it if a terminal ran it verbatim.
$ErrorActionPreference = "Continue"
cd $HOME
Write-Host "== git version =="
git --version

Write-Host "== ls-remote (network reachability) =="
git ls-remote https://github.com/Blueturboguy07/Astro.git HEAD 2>&1 | Tee-Object -Variable lsRemoteOut
$lsRemoteExit = $LASTEXITCODE
Write-Host "ls-remote exit=$lsRemoteExit"

Write-Host "== browser-equivalent HTTP check (what a reader clicking the link sees) =="
try {
  $resp = Invoke-WebRequest -Uri "https://github.com/Blueturboguy07/Astro" -UseBasicParsing -MaximumRedirection 5
  Write-Host "HTTP status: $($resp.StatusCode)"
  $httpStatus = $resp.StatusCode
} catch {
  Write-Host "HTTP request threw: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    $httpStatus = [int]$_.Exception.Response.StatusCode
    Write-Host "HTTP status: $httpStatus"
  } else {
    $httpStatus = -1
  }
}

Write-Host "== actual guide clone command, byte-for-byte (POSIX idiom, run raw) =="
if (Test-Path Astro) { Remove-Item -Recurse -Force Astro }
# This is the EXACT text publik's astro.ts Windows branch shipped on 2026-08-30
# (commit fde0b71), BEFORE it was rewritten to PowerShell by iris-windows'
# resolveGuideRecipe or by the Sep 5 guide fix. We run it through the same
# derivation a Windows machine would actually execute: PowerShell.
$guideCommand = "if (-not (Test-Path Astro/.git)) {`ngit clone https://github.com/Blueturboguy07/Astro.git`n}`ncd Astro`n"
Write-Host "--- derived command ---"
Write-Host $guideCommand
Invoke-Expression $guideCommand
$cloneExit = $LASTEXITCODE
Write-Host "clone-block exit=$cloneExit"

Write-Host "cwd after guide command: $(Get-Location)"
if (Test-Path ".git") {
  Write-Host "RESULT: clone succeeded, .git present in $(Get-Location)"
  $cloneOk = $true
} else {
  Write-Host "RESULT: clone FAILED, .git absent in $(Get-Location)"
  $cloneOk = $false
}

Write-Host "SUMMARY lsRemoteExit=$lsRemoteExit httpStatus=$httpStatus cloneOk=$cloneOk"

if ($lsRemoteExit -ne 0 -or $httpStatus -eq 404 -or -not $cloneOk) {
  Write-Host "BUGFIX_LAB_PRESENT"
  exit 1
} else {
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 0
}
