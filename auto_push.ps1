param(
  [string]$PathToWatch = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [int]$QuietSeconds = 8,
  [string]$Branch = "main",
  [string[]]$Extensions = @("*.js","*.html","*.css","*.json","*.md","*.yml","*.yaml","*.ps1","*.bat")
)

function Find-RepoRoot([string]$start) {
  $d = (Get-Item $start).FullName
  while ($true) {
    if (Test-Path (Join-Path $d ".git")) { return $d }
    $parent = Split-Path $d -Parent
    if ($parent -eq $d) { break }
    $d = $parent
  }
  return $null
}

# 0) Git dispo ?
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) { Write-Host "[ERREUR] git introuvable dans PATH." -ForegroundColor Red; Read-Host "Appuie pour fermer"; exit 1 }

# 1) Repo root
$repo = Find-RepoRoot $PathToWatch
if (-not $repo) { Write-Host "[ERREUR] Pas de dossier .git trouvé depuis $PathToWatch" -ForegroundColor Red; Read-Host "Appuie pour fermer"; exit 1 }
Set-Location $repo

Write-Host "[INFO] Watch: $repo" -ForegroundColor Cyan
Write-Host "[INFO] Branche: $Branch" -ForegroundColor Cyan
Write-Host "[INFO] Déclenchement après $QuietSeconds s sans nouvelle modif." -ForegroundColor Cyan

# 2) FileSystemWatcher
$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $repo
$fsw.IncludeSubdirectories = $true
$fsw.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, DirectoryName'

# Filtre: on regarde seulement les extensions utiles
# On capte tout, mais on ne déclenchera que si un fichier qui matche a changé
$changed = [System.Collections.Concurrent.ConcurrentBag[string]]::new()
$lastChange = $null
$pending = $false

$handler = {
  param($sender,$e)
  # Ignore .git et fichiers temporaires
  if ($e.FullPath -match "\\\.git(\W|$)") { return }
  # Match extensions
  $ok = $false
  foreach ($ext in $Extensions) {
    if ([IO.Path]::GetFileName($e.FullPath) -like $ext) { $ok = $true; break }
  }
  if (-not $ok) { return }

  $global:lastChange = Get-Date
  $global:pending = $true
  $changed.Add($e.FullPath) | Out-Null
  Write-Host "[EVT] $($e.ChangeType) $($e.FullPath)"
}

# S’abonner aux 3 événements
$createdReg = Register-ObjectEvent -InputObject $fsw -EventName Created -Action $handler
$changedReg = Register-ObjectEvent -InputObject $fsw -EventName Changed -Action $handler
$renamedReg = Register-ObjectEvent -InputObject $fsw -EventName Renamed -Action $handler
$fsw.EnableRaisingEvents = $true

try {
  while ($true) {
    Start-Sleep -Milliseconds 500

    if ($pending -and $lastChange) {
      $idle = (New-TimeSpan -Start $lastChange -End (Get-Date)).TotalSeconds
      if ($idle -ge $QuietSeconds) {
        # Vérifier qu’il y a vraiment un diff git
        $status = git status --porcelain
        if (-not [string]::IsNullOrWhiteSpace($status)) {
          Write-Host "[RUN] Changements stagin/commit/pull/push…" -ForegroundColor Yellow
          try {
            git add -A | Out-Null
            $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            git commit -m $msg | Out-Null
          } catch {
            # Si rien à commit (rare), on retombe plus bas
          }

          # Rebase/push
          try {
            git pull --rebase origin $Branch
            git push origin $Branch
            Write-Host "[OK] Push réussi." -ForegroundColor Green
          } catch {
            Write-Host "[ERREUR] git pull/push: $($_.Exception.Message)" -ForegroundColor Red
          }
        } else {
          Write-Host "[INFO] Aucun diff git (sauvegarde identique ou déjà commit)." -ForegroundColor DarkGray
        }
        # reset
        $pending = $false
        while ($changed.TryTake([ref] $null)) { } # vide la liste
      }
    }
  }
}
finally {
  Unregister-Event -SourceIdentifier $createdReg.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $changedReg.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $renamedReg.Name -ErrorAction SilentlyContinue
  $fsw.Dispose()
}