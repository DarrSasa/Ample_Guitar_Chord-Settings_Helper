@echo off
rem Colectare teorie prin DeepAstra/Codex (OpenRouter). Totul relativ la acest folder.
rem Cheia trebuie sa fie in acest folder: DeepAstra_openrouter_key.txt (NU o urca pe GitHub!)
cd /d "%~dp0"
echo [colectare.bat] folder: %~dp0
if not exist "DeepAstra_openrouter_key.txt" (
  echo EROARE: lipseste DeepAstra_openrouter_key.txt in acest folder.
  pause
  exit /b 1
)
py launch_win.py exec --provider openrouter --cwd "%~dp0" --key-file "%~dp0DeepAstra_openrouter_key.txt" --prompt-file "%~dp0PROMPT-DeepAstra-colectare.txt" --status-file "%~dp0run-status.json" --timeout 900
echo.
echo [colectare.bat] gata. Rezultatele sunt in: %~dp0colectat\
pause
