$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS 20+ from https://nodejs.org/ then run again.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed' }
if (-not (Test-Path '.env.local')) {
@'
CRM_ORIGIN=https://REPLACE-WITH-CRM-HOST
BROWSER_ACCOUNT_ID=pilot-instagram
INSTAGRAM_BROWSER_WORKER_SECRET=REPLACE-WITH-SHARED-SECRET
INSTAGRAM_EXPECTED_ACCOUNT_ID=REPLACE-WITH-NUMERIC-ID
'@ | Set-Content -Encoding utf8 '.env.local'
}
Write-Host 'Installation complete. Configure .env.local privately. Then run login.cmd, account.cmd, and start.cmd.'
