@echo off
setlocal
set "ROOT=%~dp0.."
if not exist "%ROOT%\windows.bat" echo Refusing reset: portable root validation failed.& exit /b 1
if not exist "%ROOT%\linux.sh" echo Refusing reset: portable root validation failed.& exit /b 1
if not exist "%ROOT%\mac.sh" echo Refusing reset: portable root validation failed.& exit /b 1
if /I "%~1"=="--yes" goto confirmed
echo This removes DeepSeek Harness, runtimes, credentials, sessions, caches and logs.
echo models and bootstrap files are preserved.
set /p "ANSWER=Type RESET to continue: "
if not "%ANSWER%"=="RESET" echo Cancelled.& exit /b 1
:confirmed
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root=[IO.Path]::GetFullPath('%ROOT%'); Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains((Join-Path $root 'runtimes')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; foreach($name in 'data','runtimes','packages','logs','state','temp','app'){ $p=Join-Path $root $name; if(Test-Path $p){ Remove-Item -LiteralPath $p -Recurse -Force } }; New-Item -ItemType Directory -Force -Path (Join-Path $root 'models') | Out-Null"
if errorlevel 1 exit /b %ERRORLEVEL%
echo Portable DeepSeek Harness was reset. models was preserved.
