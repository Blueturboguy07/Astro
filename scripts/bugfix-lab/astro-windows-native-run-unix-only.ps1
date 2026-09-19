# bugfix-lab oracle body for cluster astro-windows-native-run-unix-only.
#
# Reproduces guide steps "Install and set up" ("bun install" / "bun run
# dev:setup") and, if that unexpectedly succeeds, "Run Astro" ("bun run
# dev:watch") natively on Windows PowerShell (no WSL/git-bash on PATH),
# exactly as a guide-installer reader would run them at the pinned commit
# this workflow is checked out at.
#
# Prints BUGFIX_LAB_PRESENT / BUGFIX_LAB_ABSENT and exits 1 / 0 accordingly.
# Exits 2 only when the oracle itself could not run (e.g. Bun failed to
# install for reasons unrelated to this bug).

$ErrorActionPreference = "Continue"

Write-Host "=== bugfix-lab oracle: astro-windows-native-run-unix-only ==="
Write-Host "PSVersionTable:"
$PSVersionTable | Out-String | Write-Host

$repoRoot = (Get-Location).Path
$pkgDir = Join-Path $repoRoot "packages\browseros-agent"

if (-not (Test-Path $pkgDir)) {
  Write-Host "ORACLE_ERROR: $pkgDir does not exist"
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 2
}

Set-Location $pkgDir

# Guide step "Copy the env file, edit one line" (content doesn't matter for
# this bug; BROWSEROS_BINARY is never reached).
Copy-Item -Force ".env.development.example" ".env.development"

# --- Install Bun 1.3.6, exactly as guide step "Install Bun 1.3.6" does ---
Write-Host "--- installing bun ---"
try {
  iex "& {$(irm bun.sh/install.ps1)} -Version 1.3.6"
} catch {
  Write-Host "ORACLE_ERROR: bun install script threw: $_"
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 2
}

$bunDir = Join-Path $env:USERPROFILE ".bun\bin"
$env:PATH = "$bunDir;$env:PATH"

$bunExe = Join-Path $bunDir "bun.exe"
if (-not (Test-Path $bunExe)) {
  Write-Host "ORACLE_ERROR: bun.exe not found at $bunExe after install"
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 2
}

Write-Host "--- bun --version ---"
& $bunExe --version

# --- Guide step "Install and set up": bun install / bun run dev:setup ---
Write-Host "--- bun install ---"
& $bunExe install 2>&1 | Tee-Object -Variable installOutput | Write-Host
$installExit = $LASTEXITCODE
if ($installExit -ne 0) {
  Write-Host "ORACLE_ERROR: bun install itself failed (exit $installExit), unrelated to run.sh"
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 2
}

Write-Host "--- bun run dev:setup ---"
& $bunExe run dev:setup 2>&1 | Tee-Object -Variable setupOutput | Write-Host
$setupExit = $LASTEXITCODE
$setupText = ($setupOutput | Out-String)

Write-Host "--- dev:setup exit code: $setupExit ---"

$runShNotFound = ($setupText -match [regex]::Escape("command not found: ./tools/dev/run.sh")) -or
                  ($setupText -match [regex]::Escape("is not recognized as the name of a cmdlet")) -or
                  ($setupText -match "exited with code 1" -and $setupText -match "run\.sh")

if ($setupExit -ne 0 -and $runShNotFound) {
  Write-Host "BUGFIX_LAB_PRESENT"
  Write-Host "EVIDENCE: dev:setup failed on native Windows because run.sh (a bash script) cannot be invoked directly; exit=$setupExit"
  exit 1
}

if ($setupExit -ne 0) {
  # It failed, but not with the shebang-not-runnable signature we expect.
  # Could still be the Go-compile-time half of this same bug family if
  # run.sh itself has since been made Windows-runnable (e.g. rewritten in a
  # cross-platform form) but the Go build underneath still isn't. Check for
  # the syscall build errors explicitly before giving up.
  $goSyscallError = ($setupText -match "undefined: syscall\.(Kill|Flock)") -or
                     ($setupText -match "unknown field Setpgid")
  if ($goSyscallError) {
    Write-Host "BUGFIX_LAB_PRESENT"
    Write-Host "EVIDENCE: dev:setup failed with Go proc package Unix-only syscalls (GOOS=windows): $setupText"
    exit 1
  }

  Write-Host "ORACLE_ERROR: dev:setup failed for an unrecognized reason (exit $setupExit); not matching the known signature"
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 2
}

# dev:setup succeeded outright -- run.sh must have been made Windows-runnable
# (or dev:setup was rewired off it). Directly check the underlying Go
# proc package for the Unix-only syscalls the technical report (1771da5c)
# pinpointed, since dev:watch (guide step "Run Astro") exercises the same
# code at runtime and this is the cheaper, deterministic way to observe it.
Write-Host "--- dev:setup succeeded; checking tools/dev/proc for GOOS=windows compile errors ---"
Push-Location "tools\dev"
$goOutput = & go build -o NUL . 2>&1 | Out-String
$goExit = $LASTEXITCODE
Pop-Location

Write-Host $goOutput
Write-Host "--- go build exit code: $goExit ---"

if ($goExit -ne 0 -and (($goOutput -match "undefined: syscall\.(Kill|Flock)") -or ($goOutput -match "unknown field Setpgid"))) {
  Write-Host "BUGFIX_LAB_PRESENT"
  Write-Host "EVIDENCE: tools/dev/proc fails to compile natively on windows: $goOutput"
  exit 1
}

if ($goExit -ne 0) {
  Write-Host "ORACLE_ERROR: go build failed for an unrecognized reason"
  Write-Host "BUGFIX_LAB_ABSENT"
  exit 2
}

Write-Host "BUGFIX_LAB_ABSENT"
Write-Host "EVIDENCE: bun run dev:setup completed and tools/dev/proc builds natively on windows"
exit 0
