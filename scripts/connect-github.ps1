# connect-github.ps1
# Initializes git (if needed) and connects this folder to the GitHub repo.
# Usage: PowerShell -> .\scripts\connect-github.ps1

$ErrorActionPreference = 'Stop'

$repoUrl = "https://github.com/crewlife-hub/Interview-Booking-Uniform-v3.git"

function Write-Step($msg) { Write-Host "==> $msg" }

function Get-SafeDirectoryValue {
  $p = (Resolve-Path -LiteralPath ".").Path
  return ($p -replace "\\", "/")
}

function Ensure-SafeDirectory {
  $safeDir = Get-SafeDirectoryValue
  try {
    # If git considers this repo unsafe (common on some filesystems), whitelist it.
    git config --global --add safe.directory $safeDir 2>$null | Out-Null
  } catch {
    # Ignore; if git isn't installed or config fails, later commands will surface it.
  }
}

Write-Step "Working directory: $PWD"

Ensure-SafeDirectory

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is not installed or not on PATH"
}

if (-not (Test-Path -Path ".git")) {
  Write-Step "No .git found; initializing repository"
  git init | Out-Null

  # Ensure a predictable default branch
  try { git branch -M main | Out-Null } catch { }
}

$existingOrigin = $null
try { $existingOrigin = (git remote get-url origin 2>$null) } catch { }

if ([string]::IsNullOrWhiteSpace($existingOrigin)) {
  Write-Step "Adding origin remote -> $repoUrl"
  git remote add origin $repoUrl
} elseif ($existingOrigin -ne $repoUrl) {
  Write-Step "Origin already set to: $existingOrigin"
  Write-Step "Adding 'upstream' remote -> $repoUrl"
  $existingUpstream = $null
  try { $existingUpstream = (git remote get-url upstream 2>$null) } catch { }
  if ([string]::IsNullOrWhiteSpace($existingUpstream)) {
    git remote add upstream $repoUrl
  } else {
    Write-Step "Upstream already set to: $existingUpstream"
  }
} else {
  Write-Step "Origin already points to expected GitHub repo"
}

Write-Step "Remotes:"
git remote -v

Write-Step "Attempting fetch (may prompt for auth if private)"
try {
  git fetch origin
  Write-Step "Fetch succeeded"
} catch {
  Write-Host "Fetch failed. If the repo is private, authenticate via Git Credential Manager, a PAT, or use SSH remotes."
  throw
}
