@echo off
setlocal

cd /d "%~dp0"

echo ===============================================
echo  Ample Guitar Chord Progression Helper
echo  Direct EXE Build (No Prompt, Packager)
echo ===============================================

set "NODE_DIR=C:\Program Files\nodejs"
if not exist "%NODE_DIR%\node.exe" set "NODE_DIR=C:\Program Files (x86)\nodejs"
if not exist "%NODE_DIR%\node.exe" set "NODE_DIR=%LocalAppData%\Programs\nodejs"

if not exist "%NODE_DIR%\node.exe" (
  echo ERROR: node.exe not found in standard locations.
  echo Install Node.js LTS and try again.
  pause
  exit /b 1
)

set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "NPX_CMD=%NODE_DIR%\npx.cmd"
set "ICON_PATH=%~dp0public\grafics\app.ico"
set "STAGE_DIR=%~dp0.desktop-build\app"
set "OUT_DIR=%~dp0Ample Guitar Chord Progression Helper"

if not exist "package.json" (
  echo ERROR: package.json missing. Run from project root.
  pause
  exit /b 1
)

echo.
echo [1/3] Install dependencies...
call "%NPM_CMD%" install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Build web app...
call "%NPX_CMD%" vite build
if errorlevel 1 (
  echo ERROR: vite build failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Build EXE with Electron Packager...

if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
mkdir "%STAGE_DIR%"
mkdir "%STAGE_DIR%\desktop"
mkdir "%STAGE_DIR%\dist"

copy /y "%~dp0desktop\main.cjs" "%STAGE_DIR%\desktop\main.cjs" >nul
copy /y "%~dp0desktop\preload.cjs" "%STAGE_DIR%\desktop\preload.cjs" >nul
xcopy /E /I /Y "%~dp0dist\*" "%STAGE_DIR%\dist\" >nul
if exist "%~dp0public\guitar samples\" xcopy /E /I /Y "%~dp0public\guitar samples\*" "%STAGE_DIR%\dist\guitar samples\" >nul

(
  echo {
  echo   "name": "ample-guitar-chord-progression-helper",
  echo   "version": "1.0.0",
  echo   "main": "desktop/main.cjs"
  echo }
) > "%STAGE_DIR%\package.json"

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

if exist "%ICON_PATH%" (
  call "%NPX_CMD%" @electron/packager "%STAGE_DIR%" "Ample Guitar Chord Progression Helper" --platform=win32 --arch=x64 --overwrite --prune=true --out "%OUT_DIR%" --icon="%ICON_PATH%"
) else (
  call "%NPX_CMD%" @electron/packager "%STAGE_DIR%" "Ample Guitar Chord Progression Helper" --platform=win32 --arch=x64 --overwrite --prune=true --out "%OUT_DIR%"
)

if errorlevel 1 (
  echo ERROR: electron-packager failed.
  pause
  exit /b 1
)

echo.
echo Done. Open this folder:
echo "%OUT_DIR%"
pause