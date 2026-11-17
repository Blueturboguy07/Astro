# Result rows for the PowerShell parts of the Windows QA harness (pwsh 7).
# Same result.json shape as lib/rows.mjs. Dot-source this file.

if (-not $env:QA_RESULTS_DIR) { $env:QA_RESULTS_DIR = Join-Path (Get-Location) 'results\windows' }

function Get-RowDir([string]$Id) {
  $d = Join-Path $env:QA_RESULTS_DIR $Id
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  return $d
}

function Write-Row {
  param(
    [string]$Id, [string]$Title, [string]$Expected, [string]$Actual,
    [ValidateSet('pass', 'fail', 'blocked')][string]$Result,
    [string[]]$Evidence = @(), [string]$Notes = '', $Details = $null
  )
  $dir = Get-RowDir $Id
  $ev = @($Evidence | Where-Object { $_ -and (Test-Path (Join-Path $dir $_)) })
  $o = [ordered]@{
    id = $Id; title = $Title; expected = $Expected; actual = $Actual; result = $Result
    evidence = $ev; notes = $Notes; platform = 'windows'
    finished_at = (Get-Date).ToUniversalTime().ToString('o')
  }
  if ($null -ne $Details) { $o.details = $Details }
  $o | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $dir 'result.json')
  Write-Host "[$($Result.ToUpper())] $Id $Title :: $Actual"
}

# Run a row body. The body returns a hashtable: Result, Actual, Notes, Evidence, Details.
# A throw becomes a "fail" row; the script keeps going.
function Invoke-Row {
  param([string]$Id, [string]$Title, [string]$Expected, [scriptblock]$Body)
  $dir = Get-RowDir $Id
  try {
    $r = & $Body $dir
    if (-not $r -or -not $r.Result) { throw "row body returned no Result" }
    Write-Row -Id $Id -Title $Title -Expected $Expected -Actual $r.Actual -Result $r.Result `
      -Evidence @($r.Evidence) -Notes ([string]$r.Notes) -Details $r.Details
  } catch {
    Write-Row -Id $Id -Title $Title -Expected $Expected -Actual "error: $($_.Exception.Message)" -Result 'fail' `
      -Notes ("at " + $_.InvocationInfo.PositionMessage -replace '\s+', ' ')
  }
}

function Save-Json($Obj, [string]$Path) {
  $Obj | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath $Path
}
