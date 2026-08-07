param(
  [Parameter(Mandatory = $false)]
  [string]$IconPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($text) {
  Write-Host ""
  Write-Host "==> $text" -ForegroundColor Cyan
}

function Resolve-NodeTools {
  $candidates = @(
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs",
    "$env:LocalAppData\Programs\nodejs"
  )

  foreach ($base in $candidates) {
    $node = Join-Path $base "node.exe"
    $npm = Join-Path $base "npm.cmd"
    $npx = Join-Path $base "npx.cmd"
    if ((Test-Path $node) -and (Test-Path $npm) -and (Test-Path $npx)) {
      return @{ Node = $node; Npm = $npm; Npx = $npx }
    }
  }

  return @{ Node = "node"; Npm = "npm"; Npx = "npx" }
}

try {
  Set-Location -Path $PSScriptRoot

  Write-Host "==============================================="
  Write-Host "  Ample Guitar Chord Progression Helper"
  Write-Host "  Desktop EXE Builder (PowerShell)"
  Write-Host "==============================================="

  $tools = Resolve-NodeTools

  & $tools.Node -v | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Node.js is not available. Install Node.js LTS from https://nodejs.org"
  }

  & $tools.Npm -v | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "npm is not available. Reinstall Node.js LTS with PATH enabled."
  }

  if (-not (Test-Path "package.json")) {
    throw "package.json not found. Run script from project root."
  }

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    $defaultIcon = Join-Path $PSScriptRoot "public\grafics\app.ico"
    if (Test-Path $defaultIcon) {
      $IconPath = $defaultIcon
      Write-Host "Using default icon: $IconPath"
    } else {
      Write-Host "No icon path provided. Using Electron default icon."
    }
  } else {
    $IconPath = $IconPath.Trim('"')
  }

  if (-not [string]::IsNullOrWhiteSpace($IconPath)) {
    if (-not (Test-Path $IconPath)) {
      throw "Icon file not found: $IconPath"
    }
    $item = Get-Item $IconPath
    if ($item.PSIsContainer) {
      throw "Icon path is a folder. Provide a .ico file path."
    }
    if ($item.Extension.ToLowerInvariant() -ne ".ico") {
      throw "Icon must have .ico extension."
    }
  }

  if (-not (Test-Path "node_modules\vite")) {
    Write-Step "Installing dependencies"
    & $tools.Npm install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed"
    }
  }

  Write-Step "Building React app"
  $env:BUILD_TARGET = "electron"
  try {
    & $tools.Npx vite build
  } finally {
    Remove-Item Env:BUILD_TARGET -ErrorAction SilentlyContinue
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Web build failed"
  }

  Write-Step "Preparing staging app for packager"
  $stageRoot = Join-Path $PSScriptRoot ".desktop-build"
  $stageApp = Join-Path $stageRoot "app"
  $outDir = Join-Path $PSScriptRoot "Ample Guitar Chord Progression Helper"
  $packagerAppName = "Ample Guitar Chord Progression App"
  $exeName = "Ample Guitar Chord Progression Helper"

  if (Test-Path $stageRoot) {
    Remove-Item -Path $stageRoot -Recurse -Force
  }

  New-Item -ItemType Directory -Path (Join-Path $stageApp "desktop") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $stageApp "dist") -Force | Out-Null

  Copy-Item -Path (Join-Path $PSScriptRoot "desktop\main.cjs") -Destination (Join-Path $stageApp "desktop\main.cjs") -Force
  Copy-Item -Path (Join-Path $PSScriptRoot "desktop\preload.cjs") -Destination (Join-Path $stageApp "desktop\preload.cjs") -Force
  Copy-Item -Path (Join-Path $PSScriptRoot "dist\*") -Destination (Join-Path $stageApp "dist") -Recurse -Force
  if (Test-Path (Join-Path $PSScriptRoot "public\guitar samples")) {
    New-Item -ItemType Directory -Path (Join-Path $stageApp "dist\guitar samples") -Force | Out-Null
    Copy-Item -Path (Join-Path $PSScriptRoot "public\guitar samples\*") -Destination (Join-Path $stageApp "dist\guitar samples") -Recurse -Force
  }

  @"
{
  "name": "ample-guitar-chord-progression-helper",
  "version": "1.0.0",
  "main": "desktop/main.cjs"
}
"@ | Set-Content -Path (Join-Path $stageApp "package.json") -Encoding UTF8

  if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  Write-Step "Building EXE with Electron Packager"
  $args = @(
    "@electron/packager",
    $stageApp,
    $packagerAppName,
    "--platform=win32",
    "--arch=x64",
    "--overwrite",
    "--prune=true",
    "--out=$outDir",
    "--executable-name=$exeName"
  )

  if (-not [string]::IsNullOrWhiteSpace($IconPath)) {
    $args += "--icon=$IconPath"
  }

  & $tools.Npx @args
  if ($LASTEXITCODE -ne 0) {
    throw "EXE build failed (electron-packager)"
  }

  Write-Step "Building Windows installer (.exe setup)"
  $installerArgs = @("$PSScriptRoot\desktop\build-installer.cjs")
  if (-not [string]::IsNullOrWhiteSpace($IconPath)) {
    $installerArgs += "--icon=$IconPath"
  }
  & $tools.Node @installerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Installer build failed"
  }

  Write-Host ""
  Write-Host "Done. EXE generated in folder:" -ForegroundColor Green
  Write-Host (Join-Path $outDir "$packagerAppName-win32-x64")
  Write-Host "Installer folder:" -ForegroundColor Green
  Write-Host (Join-Path $PSScriptRoot "installer-out")
}
catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Press Enter to close..."
  [void](Read-Host)
  exit 1
}

Write-Host ""
Write-Host "Press Enter to close..."
[void](Read-Host)