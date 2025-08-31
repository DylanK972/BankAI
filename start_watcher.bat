@echo off
setlocal
pushd "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_push.ps1" -PathToWatch "%~dp0." -QuietSeconds 8 -Branch main
echo ==== Terminé (ou erreur). Appuie sur une touche pour fermer ====
pause >nul