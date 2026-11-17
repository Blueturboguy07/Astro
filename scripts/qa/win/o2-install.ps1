# O2 (Windows): download, verify, sign status, silent install, shortcuts, ARP.
# pwsh 7, admin (GitHub windows-latest). Writes rows O2-W-01 .. O2-W-05.
#   env: RELEASE_TAG (v0.2.4), GITHUB_REPOSITORY, GH_TOKEN, QA_WORK, QA_RESULTS_DIR
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\rows.ps1')

$tag = if ($env:RELEASE_TAG) { $env:RELEASE_TAG } else { 'v0.2.4' }
$releaseVersion = $tag.TrimStart('v')
$repo = if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY } else { 'Blueturboguy07/Astro' }
$work = if ($env:QA_WORK) { $env:QA_WORK } else { Join-Path $env:RUNNER_TEMP 'astro-qa' }
$dl = Join-Path $work 'dl'
New-Item -ItemType Directory -Force -Path $dl | Out-Null
$setup = Join-Path $dl 'Astro-Setup.exe'
$installDir = Join-Path $env:ProgramFiles 'Astro'
$exe = Join-Path $installDir 'chrome.exe'
$uninstKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Astro'
$smLnk = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Astro\Astro.lnk'
$deskLnk = Join-Path $env:PUBLIC 'Desktop\Astro.lnk'

# ---------------------------------------------------------------- O2-W-01
Invoke-Row 'O2-W-01' 'Download Astro-Setup.exe from the release; SHA-256 matches SHA256SUMS.txt' `
  "gh release download $tag gives Astro-Setup.exe and SHA256SUMS.txt; the file's SHA-256 equals the Astro-Setup.exe line" {
  param($dir)
  gh release download $tag -R $repo -p 'Astro-Setup.exe' -p 'SHA256SUMS.txt' -D $dl --clobber 2>&1 | Write-Host
  if (-not (Test-Path $setup)) { throw "Astro-Setup.exe not downloaded" }
  Copy-Item (Join-Path $dl 'SHA256SUMS.txt') (Join-Path $dir 'SHA256SUMS.txt')
  $sums = Get-Content (Join-Path $dl 'SHA256SUMS.txt')
  $line = $sums | Where-Object { $_ -match 'Astro-Setup\.exe' } | Select-Object -First 1
  $want = if ($line) { ($line -split '\s+')[0].ToLower() } else { '' }
  $got = (Get-FileHash -Algorithm SHA256 $setup).Hash.ToLower()
  $size = (Get-Item $setup).Length
  "file: $setup`nsize: $size`nsha256: $got`nSHA256SUMS line: $line" | Set-Content (Join-Path $dir 'sha256.txt')
  "ASTRO_SETUP=$setup" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
  @{
    Result   = if ($want -and $want -eq $got) { 'pass' } else { 'fail' }
    Actual   = "sha256 $got; SHA256SUMS says $(if ($want) { $want } else { '(no Astro-Setup.exe line)' }); size $size bytes"
    Evidence = @('SHA256SUMS.txt', 'sha256.txt')
  }
}

# ---------------------------------------------------------------- O2-W-02
Invoke-Row 'O2-W-02' 'Installer signature, version info and SmartScreen path' `
  "Unsigned (as the release notes say); version info names Astro and publik; admin manifest. Observation: with Mark of the Web an unsigned exe gets the SmartScreen 'Windows protected your PC' screen (More info -> Run anyway)" {
  param($dir)
  if (-not (Test-Path $setup)) { throw "no installer (O2-W-01 failed)" }
  $sig = Get-AuthenticodeSignature -LiteralPath $setup
  $vi = (Get-Item $setup).VersionInfo
  $bytes = [IO.File]::ReadAllBytes($setup)
  # The NSIS stub's embedded manifest sits in the first few MB.
  $head = [Text.Encoding]::ASCII.GetString($bytes, 0, [Math]::Min($bytes.Length, 4MB))
  $level = if ($head -match 'requestedExecutionLevel\s+level="([^"]+)"') { $Matches[1] } else { '(not found)' }
  $nsis = $head -match 'Nullsoft'
  # Mark of the Web as a browser download would set it. SmartScreen itself
  # cannot appear in a silent install on a runner.
  $motwCopy = Join-Path $dl 'Astro-Setup.motw.exe'
  Copy-Item $setup $motwCopy -Force
  Set-Content -LiteralPath $motwCopy -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3`r`nHostUrl=https://github.com/$repo/releases/download/$tag/Astro-Setup.exe"
  $zone = (Get-Content -LiteralPath $motwCopy -Stream Zone.Identifier -ErrorAction SilentlyContinue) -join ' '
  Remove-Item $motwCopy -Force -ErrorAction SilentlyContinue
  # Defender on-demand scan (exit 0 = no threat, 2 = threat found).
  $mp = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
  $defender = '(MpCmdRun.exe not present)'
  if (Test-Path $mp) {
    $p = Start-Process -FilePath $mp -ArgumentList @('-Scan', '-ScanType', '3', '-File', "`"$setup`"", '-DisableRemediation') -PassThru -Wait -NoNewWindow -RedirectStandardOutput (Join-Path $dir 'defender.txt')
    $defender = "MpCmdRun exit $($p.ExitCode)"
  }
  $info = [ordered]@{
    signatureStatus = [string]$sig.Status; signatureMessage = $sig.StatusMessage
    signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
    ProductName = $vi.ProductName; CompanyName = $vi.CompanyName; FileDescription = $vi.FileDescription
    FileVersion = $vi.FileVersion; ProductVersion = $vi.ProductVersion; LegalCopyright = $vi.LegalCopyright
    requestedExecutionLevel = $level; nsis = $nsis; motwZoneIdentifier = $zone; defender = $defender
    releaseVersion = $releaseVersion
  }
  Save-Json $info (Join-Path $dir 'installer-info.json')
  $problems = @()
  if ($vi.ProductName -ne 'Astro') { $problems += "ProductName '$($vi.ProductName)'" }
  if ($vi.CompanyName -ne 'publik') { $problems += "CompanyName '$($vi.CompanyName)'" }
  if ($level -ne 'requireAdministrator') { $problems += "execution level '$level'" }
  $verNote = if ($vi.ProductVersion -ne $releaseVersion) { "Installer ProductVersion '$($vi.ProductVersion)' is not the release version $releaseVersion (see O2-W-05). " } else { '' }
  $notes = $verNote + "SmartScreen (observation): the file is $($sig.Status). A browser download carries Mark of the Web (Zone.Identifier ZoneId=3, simulated: '$zone'), so Windows shows the SmartScreen screen 'Windows protected your PC' with Publisher: Unknown publisher until the user clicks More info -> Run anyway, then a UAC prompt (requireAdministrator, Unknown publisher). A silent /S install on the runner cannot show SmartScreen. $defender."
  @{
    Result   = if ($problems.Count -eq 0 -and [string]$sig.Status -eq 'NotSigned') { 'pass' } else { 'fail' }
    Actual   = "Authenticode $($sig.Status); ProductName=$($vi.ProductName); CompanyName=$($vi.CompanyName); FileVersion=$($vi.FileVersion); ProductVersion=$($vi.ProductVersion); level=$level" + $(if ($problems) { "; problems: $($problems -join '; ')" } else { '' })
    Notes    = $notes
    Evidence = @('installer-info.json', 'defender.txt')
    Details  = $info
  }
}

# ---------------------------------------------------------------- O2-W-03
Invoke-Row 'O2-W-03' 'Silent install (/S) to Program Files' `
  "Astro-Setup.exe /S exits 0; $exe exists with version info; one versioned payload dir with chrome.dll, the Astro CRX and no bug reporter" {
  param($dir)
  if (-not (Test-Path $setup)) { throw "no installer (O2-W-01 failed)" }
  $t0 = Get-Date
  $p = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
  $secs = [Math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
  $ok = Test-Path $exe
  $tree = Get-ChildItem -Recurse -LiteralPath $installDir -ErrorAction SilentlyContinue
  $tree | ForEach-Object { $_.FullName.Substring($installDir.Length) + $(if ($_.PSIsContainer) { '\' } else { "`t$($_.Length)" }) } |
    Set-Content (Join-Path $dir 'install-tree.txt')
  $bytes = ($tree | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
  $vdir = Get-ChildItem -Directory -LiteralPath $installDir -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+(\.\d+){1,3}$' }
  $vi = if ($ok) { (Get-Item $exe).VersionInfo } else { $null }
  $extDir = if ($vdir) { Join-Path $vdir[0].FullName 'browseros_extensions' } else { '' }
  $crx = if ($extDir -and (Test-Path $extDir)) { @(Get-ChildItem $extDir | ForEach-Object Name) } else { @() }
  $bundled = if ($extDir -and (Test-Path (Join-Path $extDir 'bundled_extensions.json'))) { Get-Content -Raw (Join-Path $extDir 'bundled_extensions.json') } else { '' }
  $winsparkle = @(Get-ChildItem -Recurse -LiteralPath $installDir -Filter 'WinSparkle.dll' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $server = @(Get-ChildItem -Recurse -LiteralPath $installDir -Filter '*.exe' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($installDir.Length) })
  $info = [ordered]@{
    exitCode = $p.ExitCode; seconds = $secs; chromeExe = $ok
    chromeVersionInfo = if ($vi) { [ordered]@{ ProductName = $vi.ProductName; FileDescription = $vi.FileDescription; CompanyName = $vi.CompanyName; FileVersion = $vi.FileVersion; ProductVersion = $vi.ProductVersion; LegalCopyright = $vi.LegalCopyright } } else { $null }
    versionDirs = @($vdir | ForEach-Object Name); installedBytes = $bytes; installedMB = [Math]::Round($bytes / 1MB, 1)
    extensionsDir = $crx; bundledExtensionsJson = $bundled; winSparkleDll = $winsparkle; exeFiles = $server
  }
  Save-Json $info (Join-Path $dir 'install-info.json')
  if ($ok) { "ASTRO_EXE=$exe" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8 }
  $problems = @()
  if ($p.ExitCode -ne 0) { $problems += "exit $($p.ExitCode)" }
  if (-not $ok) { $problems += 'chrome.exe missing' }
  if (@($vdir).Count -ne 1) { $problems += "versioned dirs: $(@($vdir).Count)" }
  if (-not ($crx -contains 'kofbmbngmnnpmopgbhpbajhnnnoflolg.crx')) { $problems += 'Astro CRX missing' }
  if ($crx -match 'adlpneommgkgeanpaekgoaolcpncohkf') { $problems += 'bug reporter CRX present' }
  @{
    Result   = if ($problems.Count -eq 0) { 'pass' } else { 'fail' }
    Actual   = "exit $($p.ExitCode) in $secs s; chrome.exe $(if ($ok) { "FileVersion $($vi.FileVersion) ProductName '$($vi.ProductName)' FileDescription '$($vi.FileDescription)'" } else { 'MISSING' }); payload $(@($vdir | ForEach-Object Name) -join ','); $($info.installedMB) MB; CRX: $($crx -join ', ')" + $(if ($problems) { "; problems: $($problems -join '; ')" } else { '' })
    Evidence = @('install-info.json', 'install-tree.txt')
    Details  = $info
  }
}

# ---------------------------------------------------------------- O2-W-04
Invoke-Row 'O2-W-04' 'Start-menu and desktop shortcuts' `
  "Start menu\Programs\Astro\Astro.lnk and Public Desktop\Astro.lnk exist and point to $exe" {
  param($dir)
  $sh = New-Object -ComObject WScript.Shell
  $out = @()
  foreach ($l in @($smLnk, $deskLnk)) {
    if (Test-Path -LiteralPath $l) {
      $s = $sh.CreateShortcut($l)
      $out += [ordered]@{ path = $l; exists = $true; name = [IO.Path]::GetFileNameWithoutExtension($l); target = $s.TargetPath; arguments = $s.Arguments; workingDirectory = $s.WorkingDirectory; icon = $s.IconLocation }
    } else { $out += [ordered]@{ path = $l; exists = $false } }
  }
  # Any other shortcut the installer made (per-user locations too).
  $extra = @()
  foreach ($root in @("$env:ProgramData\Microsoft\Windows\Start Menu", "$env:APPDATA\Microsoft\Windows\Start Menu", "$env:USERPROFILE\Desktop", "$env:PUBLIC\Desktop")) {
    $extra += @(Get-ChildItem -Recurse -LiteralPath $root -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'astro|browser\s?os' } | ForEach-Object FullName)
  }
  Save-Json @{ shortcuts = $out; matchingLnkFiles = $extra } (Join-Path $dir 'shortcuts.json')
  $bad = @($out | Where-Object { -not $_.exists -or $_.target -ne $exe })
  @{
    Result   = if ($bad.Count -eq 0) { 'pass' } else { 'fail' }
    Actual   = ($out | ForEach-Object { if ($_.exists) { "$($_.path) -> $($_.target) $($_.arguments)" } else { "$($_.path) MISSING" } }) -join '; '
    Notes    = "all .lnk files named astro/browseros: $($extra -join '; ')"
    Evidence = @('shortcuts.json')
  }
}

# ---------------------------------------------------------------- O2-W-05
Invoke-Row 'O2-W-05' 'Add/Remove Programs entry' `
  "HKLM Uninstall\Astro: DisplayName Astro, Publisher publik, DisplayVersion $releaseVersion (the release), UninstallString and QuietUninstallString point to an existing Uninstall.exe, EstimatedSize close to the installed size" {
  param($dir)
  if (-not (Test-Path $uninstKey)) { throw "ARP key $uninstKey missing" }
  $k = Get-ItemProperty $uninstKey
  $vals = [ordered]@{}
  foreach ($n in @('DisplayName', 'DisplayVersion', 'Publisher', 'DisplayIcon', 'InstallLocation', 'UninstallString', 'QuietUninstallString', 'EstimatedSize', 'NoModify', 'NoRepair', 'URLInfoAbout', 'HelpLink')) { $vals[$n] = $k.$n }
  $wow = Test-Path 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Astro'
  $uexe = Join-Path $installDir 'Uninstall.exe'
  $actualKB = [Math]::Round((Get-ChildItem -Recurse -File -LiteralPath $installDir | Measure-Object Length -Sum).Sum / 1KB)
  $all = Get-ChildItem 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -match 'astro|browser\s?os' } | ForEach-Object { "$($_.DisplayName) $($_.DisplayVersion) [$($_.Publisher)]" }
  $info = [ordered]@{ key = $uninstKey; values = $vals; wow6432Duplicate = $wow; uninstallExeExists = (Test-Path $uexe); installedKB = $actualKB; arpEntriesNamedAstroOrBrowserOS = @($all) }
  Save-Json $info (Join-Path $dir 'arp.json')
  $problems = @()
  if ($vals.DisplayName -ne 'Astro') { $problems += "DisplayName '$($vals.DisplayName)'" }
  if ($vals.Publisher -ne 'publik') { $problems += "Publisher '$($vals.Publisher)'" }
  if ($vals.DisplayVersion -ne $releaseVersion) { $problems += "DisplayVersion '$($vals.DisplayVersion)' is not the release version $releaseVersion (users see this in Settings > Apps)" }
  if (-not (Test-Path $uexe)) { $problems += 'Uninstall.exe missing' }
  if (-not $vals.QuietUninstallString) { $problems += 'no QuietUninstallString' }
  if ($vals.EstimatedSize -and [Math]::Abs($vals.EstimatedSize - $actualKB) -gt ($actualKB * 0.1)) { $problems += "EstimatedSize $($vals.EstimatedSize) KB vs installed $actualKB KB" }
  @{
    Result   = if ($problems.Count -eq 0) { 'pass' } else { 'fail' }
    Actual   = "DisplayName=$($vals.DisplayName); DisplayVersion=$($vals.DisplayVersion); Publisher=$($vals.Publisher); UninstallString=$($vals.UninstallString); QuietUninstallString=$($vals.QuietUninstallString); EstimatedSize=$($vals.EstimatedSize) KB (installed $actualKB KB)" + $(if ($problems) { "; problems: $($problems -join '; ')" } else { '' })
    Evidence = @('arp.json')
    Details  = $info
  }
}

exit 0
