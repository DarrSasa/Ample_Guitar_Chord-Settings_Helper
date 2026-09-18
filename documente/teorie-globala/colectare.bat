@echo off
rem Ruleaza colectarea teoriei prin DeepAstra/Codex (OpenRouter), fara probleme de "^".
cd /d "%~dp0"
py launch_win.py exec --provider openrouter --cwd "C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper_Details\Web_Guitar_Theory" --key-file "C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper_Details\Web_Guitar_Theory\DeepAstra_openrouter_key.txt" --prompt-file "PROMPT-DeepAstra-colectare.txt" --status-file "C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper_Details\Web_Guitar_Theory\run-status.json" --timeout 900
pause
