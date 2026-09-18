@echo off
rem Colectare teorie prin DeepAstra/Codex (OpenRouter). Relativ la acest folder.
cd /d "%~dp0"
echo [1] folder: %~dp0
echo [2] launch_win.py prezent?
if exist launch_win.py (echo DA) else (echo NU - fa git pull mai intai)
echo [3] cheia prezent?
if exist DeepAstra_openrouter_key.txt (echo DA) else (echo NU)
echo [4] python:
python --version 2>&1
echo [5] pornesc launch_win.py exec ...
python launch_win.py exec --provider openrouter --cwd "%~dp0" --key-file "%~dp0DeepAstra_openrouter_key.txt" --prompt-file "%~dp0PROMPT-DeepAstra-colectare.txt" --status-file "%~dp0run-status.json" --timeout 900 2>&1
echo.
echo [6] gata. exit code: %ERRORLEVEL%
pause
