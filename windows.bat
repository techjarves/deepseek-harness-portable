@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\portable.ps1" %*
exit /b %ERRORLEVEL%
