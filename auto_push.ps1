# Auto push (polling) - vérifie toutes les 2s s'il y a des changements et push
# Mets ce fichier à la racine du repo BankAI et lance start_watcher.bat

# -- Chemin du repo (laisse comme ça si tu lances via start_watcher.bat) --
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

# (Optionnel) identités git si non configurées
# git config user.name "Dylan"
# git config user.email "ton-email@exemple.com"

Write-Host "👀 Watch actif sur $repo (Ctrl+C pour arrêter)"

while ($true) {
  try {
    $changes = git status --porcelain
    if ($LASTEXITCODE -ne 0) {
      Write-Host "⚠️  git introuvable ou erreur de repo. Ouvre ce dossier avec GitHub Desktop pour initialiser."
    } elseif ($changes) {
      Write-Host "🔄 Changements détectés :"
      Write-Host $changes
      git add -A | Out-Null
      $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
      git commit -m $msg | Out-Null
      git push | Out-Null
      Write-Host "✅ Push $msg"
    }
  } catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 2
}
