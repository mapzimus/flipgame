# Sync bare-bones Parrot Flip into a Whydah-Unit checkout (Windows PowerShell).
# Usage (from anywhere):
#   cd C:\Users\HoweM\repos\flipgame
#   .\tools\apply-parrot-flip-whydah.ps1 ..\Whydah-Unit
#
# Requires: git, node (Node.js)

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$WhydahUnitPath
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DestRoot = (Resolve-Path $WhydahUnitPath).Path
$Dest = Join-Path $DestRoot 'parrot-flip'

Write-Host "Syncing bare-bones Parrot Flip -> $Dest"
node (Join-Path $Root 'tools\sync-parrot-flip.js') $Dest

Push-Location $DestRoot
try {
  git add -A parrot-flip
  git status --short

  $branch = 'cursor/parrot-flip-barebones-whydah'
  git checkout -B $branch

  $msg = @"
Sync bare-bones Parrot Flip from flipgame

Parrots + base party game only. No achievements, unlocks, or Hall of Fame.
Classroom games-gate retained. Bottle Flip elsewhere is unchanged.
"@
  git commit -m $msg
  if ($LASTEXITCODE -ne 0) {
    Write-Host '(nothing new to commit, or commit failed — check status above)'
  }

  Write-Host ''
  Write-Host 'Push when ready:'
  Write-Host "  git push -u origin $branch"
  Write-Host '  # then open a PR into main on GitHub, or:'
  Write-Host "  git push origin ${branch}:main"
}
finally {
  Pop-Location
}
