# Auto push to GitHub on file changes (BankIA)
# Usage: double-click start_watcher.bat (included) OR run this script in PowerShell.
# It will watch the repo and run: git add -A && git commit && git push

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path   # assume script lives in repo root
Set-Location $repo

# Optional: set identity if not already configured for this repo
# git config user.name "TonNom"
# git config user.email "ton-email@exemple.com"

Write-Host "👀 Watch actif sur $repo (Ctrl+C pour arrêter)"

# Create a FileSystemWatcher
$fsw = New-Object System.IO.FileSystemWatcher $repo -Property @{
  IncludeSubdirectories = $true
  Filter = '*.*'
  EnableRaisingEvents = $true
}

# Debounce to avoid too many commits
$script:lastChange = Get-Date
$debounceMs = 600

$action = {
  $now = Get-Date
  if (($now - $script:lastChange).TotalMilliseconds -lt $debounceMs) { return }
  $script:lastChange = $now

  Start-Sleep -Milliseconds 200  # short delay to let editors finish writing
  $changes = git status --porcelain
  if ($changes) {
    git add -A | Out-Null
    $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit -m $msg | Out-Null
    git push | Out-Null
    Write-Host "✅ Push $msg"
  }
}

Register-ObjectEvent $fsw Changed -Action $action | Out-Null
Register-ObjectEvent $fsw Created -Action $action | Out-Null
Register-ObjectEvent $fsw Deleted -Action $action | Out-Null
Register-ObjectEvent $fsw Renamed -Action $action | Out-Null

while ($true) { Start-Sleep -Seconds 1 }
