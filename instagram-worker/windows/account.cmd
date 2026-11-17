@echo off
cd /d "%~dp0.."
set "INSTAGRAM_BROWSER_PROFILE_DIR=%LOCALAPPDATA%\MIXIT\instagram-pilot"
node --env-file=.env.local worker.mjs --account
pause
