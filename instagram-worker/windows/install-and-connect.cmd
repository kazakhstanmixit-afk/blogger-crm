@echo off
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js LTS from the official website, then run this file again.
 start https://nodejs.org/
 pause
 exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
 pause
 exit /b 1
)
cd /d "%~dp0.."
node pair.mjs
if errorlevel 1 (
 pause
 exit /b 1
)
echo Starting Instagram robot. Keep this window open.
node --env-file=.env.local worker.mjs
pause
