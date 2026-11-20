$ErrorActionPreference = 'Stop'
$workerRoot = Join-Path $env:USERPROFILE 'Downloads\blogger-crm-main\blogger-crm-main\instagram-worker'
if (-not (Test-Path (Join-Path $workerRoot 'node_modules\playwright\package.json'))) {
 Add-Type -AssemblyName System.Windows.Forms
 $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
 $dialog.Description = 'Select your existing instagram-worker folder. No files will be replaced.'
 $dialog.ShowNewFolderButton = $false
 if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
 $workerRoot = $dialog.SelectedPath
}
$packagePath = Join-Path $workerRoot 'package.json'
if (-not (Test-Path $packagePath)) { throw 'Wrong folder. Select instagram-worker.' }
$package = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne 'mixit-instagram-browser-worker') { throw 'Wrong folder. Select instagram-worker.' }
& node (Join-Path $PSScriptRoot 'inspect-instagram.mjs') $workerRoot $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Diagnostic did not complete. Keep this window open.' }
