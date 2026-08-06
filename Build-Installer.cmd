@echo off
setlocal

cd /d "%~dp0"

echo ===============================================
echo  Ample Guitar Chord Progression Helper
echo  Build Installer EXE (NSIS)
echo ===============================================
echo.
echo Optional: drag-and-drop your .ico on this file
echo or run: Build-Installer.cmd "C:\Path\app.ico"
echo.

set "ICON_ARG="
if not "%~1"=="" set "ICON_ARG=--icon=""%~1"""

node "%~dp0desktop\build-installer.cjs" %ICON_ARG%
if errorlevel 1 (
  echo.
  echo ERROR: Installer build failed.
  pause
  exit /b 1
)

echo.
echo Success. Open folder:
echo "installer-out"
pause