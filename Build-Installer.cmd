@echo off
REM Wrapper: double-click me to run Build-Installer.ps1 without needing to
REM change the PowerShell ExecutionPolicy.
REM
REM Usage:
REM   Build-Installer.cmd                       -> interactive menu
REM   Build-Installer.cmd Portable              -> just the portable EXE
REM   Build-Installer.cmd Installer             -> just the NSIS installer
REM   Build-Installer.cmd Both                  -> both
REM   Build-Installer.cmd Portable "C:\my.ico"  -> portable with custom icon

setlocal
cd /d "%~dp0"

set "MODE=%~1"
set "ICON=%~2"

set "MODE_ARG="
if not "%MODE%"=="" set "MODE_ARG=-Mode %MODE%"

set "ICON_ARG="
if not "%ICON%"=="" set "ICON_ARG=-IconPath ""%ICON%"""

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Installer.ps1" %MODE_ARG% %ICON_ARG%

if errorlevel 1 (
  echo.
  echo Build finished with errors. See messages above.
  pause
  exit /b 1
)

endlocal
