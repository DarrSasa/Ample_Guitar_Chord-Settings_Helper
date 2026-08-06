@echo off
setlocal

rem One-click build using the default icon location in this project.
cd /d "%~dp0"

set "DEFAULT_ICON=%~dp0public\grafics\app.ico"

if exist "%DEFAULT_ICON%" (
  call "%~dp0Build-EXE.bat" "%DEFAULT_ICON%"
) else (
  echo app.ico not found in public\grafics
  echo Running build with default Electron icon...
  call "%~dp0Build-EXE.bat"
)