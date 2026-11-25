@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
start "LocaMais - Central de Controle" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\locamais-control-panel.ps1"
endlocal
