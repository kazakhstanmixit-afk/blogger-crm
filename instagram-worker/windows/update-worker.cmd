@echo off
echo Close the old robot window before continuing.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
if errorlevel 1 pause
