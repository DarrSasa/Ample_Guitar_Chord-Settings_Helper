@echo off
setlocal EnableDelayedExpansion

rem Always run from the folder where this .bat file is located.
cd /d "%~dp0"

title Build EXE - Ample Guitar Chord Progression Helper

echo ===============================================
echo   Ample Guitar Chord Progression Helper
echo   Desktop EXE Builder
echo ===============================================
echo.
echo Optional: enter full path to your .ico file.
echo Example: C:\Users\YourName\Desktop\my-icon.ico
echo If left empty, the default Electron icon will be used.
echo You can also drag and drop the .ico file onto this .bat file.
echo.

set "NODE_EXE=node"
set "NPM_CMD=npm"
set "NPX_CMD=npx"

call :check_node
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
    set "NPX_CMD=%ProgramFiles%\nodejs\npx.cmd"
  ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
    set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
    set "NPX_CMD=%ProgramFiles(x86)%\nodejs\npx.cmd"
  ) else if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
    set "NPM_CMD=%LocalAppData%\Programs\nodejs\npm.cmd"
    set "NPX_CMD=%LocalAppData%\Programs\nodejs\npx.cmd"
  )
)

call :check_node
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Install Node.js LTS from https://nodejs.org and reopen this .bat file.
  echo.
  echo Tip: if Node is installed, reboot Windows once to refresh PATH.
  pause
  exit /b 1
)

call :check_npm
if errorlevel 1 (
  echo ERROR: npm is not available.
  echo Reinstall Node.js LTS and make sure "Add to PATH" is enabled.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERROR: package.json not found in current folder.
  echo Script location: %~dp0
  echo Run this script from the project root folder.
  pause
  exit /b 1
)

set "ICON_PATH=%~1"
if "%ICON_PATH%"=="" (
  set /p "ICON_PATH=ICO path (Enter for default): "
)
set "ICON_PATH=%ICON_PATH:"=%"

echo.
if "%ICON_PATH%"=="" (
  echo Icon: default Electron icon
) else (
  echo Icon: "%ICON_PATH%"
)

if not "%ICON_PATH%"=="" (
  if not exist "%ICON_PATH%" (
    echo.
    echo ERROR: Icon file not found:
    echo "%ICON_PATH%"
    pause
    exit /b 1
  )
  if exist "%ICON_PATH%\" (
    echo.
    echo ERROR: You entered a folder path.
    echo Please enter the full path to a .ico file, not a directory.
    echo Example: C:\My Folder\my-icon.ico
    pause
    exit /b 1
  )
  set "ICON_EXT=%ICON_PATH:~-4%"
  if /I not "%ICON_EXT%"==".ico" (
    echo.
    echo ERROR: Selected file is not .ico
    pause
    exit /b 1
  )
)

if not exist "node_modules\vite\" (
  echo.
  echo Dependencies not found. Running npm install...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

if not exist "node_modules\vite\" (
  echo.
  echo ERROR: Vite package is still missing after npm install.
  pause
  exit /b 1
)

echo.
echo [1/2] Building React app...
set "BUILD_TARGET=electron"
call "%NPX_CMD%" vite build
set "BUILD_TARGET="
if errorlevel 1 (
  echo.
  echo ERROR: Web build failed.
  pause
  exit /b 1
)

echo.
echo [2/2] Building Windows EXE with Electron Packager...

set "STAGE_DIR=%~dp0.desktop-build\app"
set "OUT_DIR=%~dp0Ample Guitar Chord Progression Helper"

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

if "%ICON_PATH%"=="" (
  call "%NPX_CMD%" @electron/packager "%STAGE_DIR%" "Ample Guitar Chord Progression Helper" --platform=win32 --arch=x64 --overwrite --prune=true --out "%OUT_DIR%"
) else (
  call "%NPX_CMD%" @electron/packager "%STAGE_DIR%" "Ample Guitar Chord Progression Helper" --platform=win32 --arch=x64 --overwrite --prune=true --out "%OUT_DIR%" --icon="%ICON_PATH%"
)
if errorlevel 1 (
  echo.
  echo ERROR: EXE build failed (electron-packager).
  pause
  exit /b 1
)

echo.
echo Done. EXE generated in folder:
echo "Ample Guitar Chord Progression Helper"
echo.
pause

goto :eof

:check_node
"%NODE_EXE%" -v >nul 2>nul
exit /b %errorlevel%

:check_npm
"%NPM_CMD%" -v >nul 2>nul
exit /b %errorlevel%