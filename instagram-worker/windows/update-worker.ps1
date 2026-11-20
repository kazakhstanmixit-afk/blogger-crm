$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select the EXISTING instagram-worker folder (or blogger-crm project folder). Close the old robot window first.'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
$workerRoot = $dialog.SelectedPath
if (Test-Path (Join-Path $workerRoot 'instagram-worker/package.json')) { $workerRoot = Join-Path $workerRoot 'instagram-worker' }
$packagePath = Join-Path $workerRoot 'package.json'
if (-not (Test-Path $packagePath)) { throw 'Wrong folder: package.json is missing.' }
$package = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne 'mixit-instagram-browser-worker') { throw 'This is not the Instagram worker folder.' }
if (-not (Test-Path (Join-Path $workerRoot '.env.local'))) { throw 'No existing connection found. Select the folder where the robot was previously connected.' }
$source = Join-Path $PSScriptRoot 'robot.mjs'
if (-not (Test-Path $source)) { throw 'Extract the complete update ZIP before running UPDATE.cmd.' }
$target = Join-Path $workerRoot 'robot.mjs'
if (Test-Path $target) { Copy-Item $target ($target + '.before-direct-update') -Force }
Copy-Item $source $target -Force
Write-Host 'Robot updated. Instagram session and CRM connection preserved.'
$startPath = Join-Path $workerRoot 'windows/start.cmd'
if (Test-Path $startPath) { Start-Process -FilePath $startPath -WorkingDirectory $workerRoot }
