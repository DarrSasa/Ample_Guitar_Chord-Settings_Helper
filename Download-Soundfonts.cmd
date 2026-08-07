@echo off
REM Wrapper: double-click to download the GM guitar soundfonts to
REM public/soundfonts/ without needing to change the PowerShell ExecutionPolicy.

setlocal
cd /d "%~dp0"

set "FORCE_ARG="
if "%~1"=="-Force" set "FORCE_ARG=-Force"
if "%~1"=="/Force" set "FORCE_ARG=-Force"
if "%~1"=="force" set "FORCE_ARG=-Force"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Download-Soundfonts.ps1" %FORCE_ARG%

if errorlevel 1 (
  echo.
  echo Download finished with errors. See messages above.
  pause
  exit /b 1
)

endlocal
