# connect-all.ps1
# One-stop helper: connect git remote + run clasp login with auto-browser.
# Usage: PowerShell -> .\scripts\connect-all.ps1

$ErrorActionPreference = 'Stop'

Write-Host "==> Connecting GitHub"
& "$PSScriptRoot\connect-github.ps1"

Write-Host ""
Write-Host "==> Connecting Apps Script (clasp login)"
& "$PSScriptRoot\clasp-login.ps1"

Write-Host ""
Write-Host "==> Done. Next: clasp pull / clasp push"
