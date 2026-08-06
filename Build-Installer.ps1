param(
  [Parameter(Mandatory = $false)]
  [string]$IconPath = ""
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "==============================================="
Write-Host " Ample Guitar Chord Progression Helper"
Write-Host " Build Installer EXE (NSIS)"
Write-Host "==============================================="

$args = @("$PSScriptRoot\desktop\build-installer.cjs")
if (-not [string]::IsNullOrWhiteSpace($IconPath)) {
  $args += "--icon=$IconPath"
}

node @args
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "ERROR: Installer build failed." -ForegroundColor Red
  Write-Host "Press Enter to close..."
  [void](Read-Host)
  exit 1
}

Write-Host ""
Write-Host "Success. Open folder: installer-out" -ForegroundColor Green
Write-Host "Press Enter to close..."
[void](Read-Host)