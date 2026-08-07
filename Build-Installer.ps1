# =============================================================================
# Ample Guitar Chord Progression Helper — Windows build script
#
# Two build modes:
#   1) Portable  — single .exe you can double-click, no installation. Fast.
#   2) Installer — NSIS setup.exe with Start Menu + Desktop shortcuts. Slower.
#
# Usage from PowerShell in the project folder:
#   .\Build-Installer.ps1                  # interactive menu
#   .\Build-Installer.ps1 -Mode Portable   # just the portable EXE
#   .\Build-Installer.ps1 -Mode Installer  # just the NSIS installer
#   .\Build-Installer.ps1 -Mode Both       # both, portable first
#   .\Build-Installer.ps1 -Mode Portable -IconPath "C:\path\app.ico"
#   .\Build-Installer.ps1 -Mode Installer -SkipInstall   # skip npm install
#
# Fixes the "2.7z produced no files" error some users saw when NSIS/MSI
# downloads got corrupted: we now purge the broken cache and retry.
# =============================================================================

param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("Portable", "Installer", "Both", "Menu")]
  [string]$Mode = "Menu",

  [Parameter(Mandatory = $false)]
  [string]$IconPath = "",

  [Parameter(Mandatory = $false)]
  [switch]$SkipInstall,

  [Parameter(Mandatory = $false)]
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Section {
  param([string]$Text)
  Write-Host ""
  Write-Host "===============================================" -ForegroundColor Cyan
  Write-Host " $Text" -ForegroundColor Cyan
  Write-Host "===============================================" -ForegroundColor Cyan
}

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Yellow
}

function Write-Ok {
  param([string]$Text)
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Err {
  param([string]$Text)
  Write-Host "[ERROR] $Text" -ForegroundColor Red
}

function Assert-Command {
  param([string]$Name, [string]$Hint)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Err "$Name is not installed or not in PATH."
    Write-Host "       $Hint" -ForegroundColor DarkGray
    throw "$Name missing"
  }
}

function Invoke-Native {
  # Run a native command and throw on non-zero exit, so the script stops
  # instead of silently continuing with a broken state.
  param(
    [Parameter(Mandatory = $true)] [string]$File,
    [Parameter(Mandatory = $false)] [string[]]$Arguments = @()
  )
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $File $($Arguments -join ' ')"
  }
}

function Resolve-IconPath {
  param([string]$UserIcon)
  if ($UserIcon -and $UserIcon.Trim() -ne "") {
    if (-not (Test-Path $UserIcon)) { throw "Icon file not found: $UserIcon" }
    if ([System.IO.Path]::GetExtension($UserIcon).ToLower() -ne ".ico") {
      throw "Icon must be a .ico file"
    }
    return (Resolve-Path $UserIcon).Path
  }
  $default = Join-Path $PSScriptRoot "public\grafics\app.ico"
  if (Test-Path $default) { return (Resolve-Path $default).Path }
  return ""
}

function Ensure-Dependencies {
  if ($SkipInstall) {
    Write-Host "Skipping npm install (--SkipInstall)." -ForegroundColor DarkGray
    return
  }
  $nm = Join-Path $PSScriptRoot "node_modules"
  $viteBin = Join-Path $nm "vite\bin\vite.js"
  if ((Test-Path $nm) -and (Test-Path $viteBin)) {
    Write-Host "node_modules present — skipping npm install." -ForegroundColor DarkGray
    return
  }
  Write-Step "Installing dependencies (npm install)"
  Invoke-Native -File "npm.cmd" -Arguments @("install", "--no-audit", "--no-fund")
}

function Build-WebBundle {
  # Vite build with BUILD_TARGET=electron so vite.config.ts activates the
  # singleFile plugin — Electron's main.cjs loads dist/index.html via file://
  # and needs everything inlined.
  Write-Step "Building the web bundle (vite build, single-file for Electron)"
  $prev = $env:BUILD_TARGET
  $env:BUILD_TARGET = "electron"
  try {
    Invoke-Native -File "npm.cmd" -Arguments @("run", "build:electron")
  } finally {
    if ($null -eq $prev) { Remove-Item Env:BUILD_TARGET -ErrorAction SilentlyContinue }
    else { $env:BUILD_TARGET = $prev }
  }
}

# ---------------------------------------------------------------------------
# Portable build (fast — uses @electron/packager)
# ---------------------------------------------------------------------------

function Build-Portable {
  param([string]$IconResolved)

  Write-Section "PORTABLE build"

  $appName = "Ample Guitar Chord Progression Helper"
  $outDir = Join-Path $PSScriptRoot "portable-out"
  $stageDir = Join-Path $PSScriptRoot ".desktop-build\app"

  Write-Step "Preparing staging folder"
  if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
  New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $stageDir "desktop") -Force | Out-Null

  Copy-Item -Path (Join-Path $PSScriptRoot "desktop\main.cjs") `
            -Destination (Join-Path $stageDir "desktop\main.cjs") -Force
  Copy-Item -Path (Join-Path $PSScriptRoot "desktop\preload.cjs") `
            -Destination (Join-Path $stageDir "desktop\preload.cjs") -Force
  Copy-Item -Path (Join-Path $PSScriptRoot "dist") `
            -Destination (Join-Path $stageDir "dist") -Recurse -Force

  # Bundle guitar samples inside dist so Electron can load them via file://
  $samplesSrc = Join-Path $PSScriptRoot "public\guitar samples"
  if (Test-Path $samplesSrc) {
    $samplesDst = Join-Path $stageDir "dist\guitar samples"
    New-Item -ItemType Directory -Path $samplesDst -Force | Out-Null
    Copy-Item -Path (Join-Path $samplesSrc "*") -Destination $samplesDst -Recurse -Force
  }

  $stagePkg = @{
    name    = "ample-guitar-chord-progression-helper"
    version = "1.0.0"
    main    = "desktop/main.cjs"
    author  = "Ample Guitar Chord Progression Helper"
  } | ConvertTo-Json -Depth 4
  # UTF-8 without BOM — Electron's package.json reader does not like a BOM.
  $stagePkgPath = Join-Path $stageDir "package.json"
  [System.IO.File]::WriteAllText($stagePkgPath, $stagePkg, [System.Text.UTF8Encoding]::new($false))

  Write-Step "Packing with @electron/packager"
  if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null

  $packagerBin = Join-Path $PSScriptRoot "node_modules\@electron\packager\bin\electron-packager.js"
  if (-not (Test-Path $packagerBin)) {
    throw "electron-packager not found. Run 'npm install' first (or omit -SkipInstall)."
  }

  $packArgs = @(
    $packagerBin,
    $stageDir,
    $appName,
    "--platform=win32",
    "--arch=x64",
    "--overwrite",
    "--prune=true",
    "--out=$outDir",
    "--executable-name=$appName"
  )
  if ($IconResolved -ne "") { $packArgs += "--icon=$IconResolved" }

  Invoke-Native -File "node" -Arguments $packArgs

  $exeFolder = Join-Path $outDir "$appName-win32-x64"
  $exePath = Join-Path $exeFolder "$appName.exe"
  if (-not (Test-Path $exePath)) {
    throw "Portable EXE was not produced at expected path: $exePath"
  }

  Write-Ok "Portable build ready."
  Write-Host "  Folder: $exeFolder" -ForegroundColor Green
  Write-Host "  EXE:    $exePath" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Tip: the whole folder is portable — copy it anywhere and run the .exe." -ForegroundColor DarkGray
  return $exeFolder
}

# ---------------------------------------------------------------------------
# Installer build (NSIS only — MSI is skipped because it caused the
# '2.7z produced no files' error some users reported)
# ---------------------------------------------------------------------------

function Purge-ElectronBuilderCache {
  # If a previous run downloaded a broken .7z, electron-builder happily
  # reuses it and keeps failing. Wipe the cache so it re-downloads clean.
  $cacheRoot = Join-Path $env:LOCALAPPDATA "electron-builder\Cache"
  if (Test-Path $cacheRoot) {
    Write-Host "Cleaning electron-builder cache: $cacheRoot" -ForegroundColor DarkGray
    Get-ChildItem -Path $cacheRoot -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        # Only nuke suspicious partial files (0 bytes) and known tool caches.
        # Keeping Electron itself avoids a 100 MB re-download every time.
        if ($_.PSIsContainer -and ($_.Name -match "^(nsis|winCodeSign|appimage)")) {
          Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        } elseif (-not $_.PSIsContainer -and $_.Length -eq 0) {
          Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
      } catch {
        # best effort
      }
    }
  }
}

function Build-Installer {
  param(
    [string]$IconResolved,
    [string]$PortableExeFolder
  )

  Write-Section "INSTALLER build (NSIS .exe)"

  $appName = "Ample Guitar Chord Progression Helper"

  # If the caller hasn't built the portable app yet, do it now — the installer
  # is packaged from that folder (--prepackaged) which is much faster and
  # avoids electron-builder re-downloading Electron.
  if (-not $PortableExeFolder -or -not (Test-Path $PortableExeFolder)) {
    Write-Host "Portable build missing — building it first as installer input." -ForegroundColor DarkGray
    $PortableExeFolder = Build-Portable -IconResolved $IconResolved
  }

  $installerOut = Join-Path $PSScriptRoot "installer-out"
  $installerProjectDir = Join-Path $PSScriptRoot ".desktop-build\installer-project"

  Write-Step "Preparing NSIS project"
  if (Test-Path $installerProjectDir) { Remove-Item $installerProjectDir -Recurse -Force }
  New-Item -ItemType Directory -Path $installerProjectDir -Force | Out-Null

  # Resolve Electron version from root package.json so electron-builder does
  # not go looking for a different one.
  $rootPkg = Get-Content (Join-Path $PSScriptRoot "package.json") -Raw | ConvertFrom-Json
  $rawVersion = $null
  if ($rootPkg.devDependencies -and $rootPkg.devDependencies.electron) {
    $rawVersion = [string]$rootPkg.devDependencies.electron
  } elseif ($rootPkg.dependencies -and $rootPkg.dependencies.electron) {
    $rawVersion = [string]$rootPkg.dependencies.electron
  } else {
    $rawVersion = "30.5.1"
  }
  $electronVersion = ($rawVersion -replace '^[^\d]*', '')

  $win = [ordered]@{
    target = @(
      [ordered]@{
        target = "nsis"
        arch   = @("x64")
      }
    )
  }
  if ($IconResolved -ne "") { $win["icon"] = $IconResolved }

  $installerConfig = [ordered]@{
    name        = "ample-guitar-chord-progression-helper-installer"
    version     = "1.0.0"
    description = "Windows installer for $appName"
    author      = "Ample Guitar Chord Progression Helper"
    build       = [ordered]@{
      appId           = "ro.ample.helper"
      productName     = $appName
      directories     = [ordered]@{ output = $installerOut }
      win             = $win
      electronVersion = $electronVersion
      nsis            = [ordered]@{
        oneClick                          = $false
        allowToChangeInstallationDirectory = $true
        createDesktopShortcut             = $true
        createStartMenuShortcut           = $true
        shortcutName                      = $appName
        runAfterFinish                    = $false
      }
      artifactName    = "AmpleInstaller.exe"
    }
  }
  $installerJson = $installerConfig | ConvertTo-Json -Depth 12
  # Write as UTF-8 WITHOUT BOM — electron-builder chokes on a BOM in package.json.
  $installerPkgPath = Join-Path $installerProjectDir "package.json"
  [System.IO.File]::WriteAllText($installerPkgPath, $installerJson, [System.Text.UTF8Encoding]::new($false))

  # Purge any broken cached downloads that caused the "2.7z produced no
  # files" error on previous runs.
  Purge-ElectronBuilderCache

  # electron-builder normally validates every dependency version against
  # npm — that fails on offline / slow networks. Turn it off.
  $env:USE_HARD_LINKS = "false"
  $env:ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = "true"
  $env:ELECTRON_BUILDER_CACHE = Join-Path $env:LOCALAPPDATA "electron-builder\Cache"

  $builderCli = Join-Path $PSScriptRoot "node_modules\electron-builder\out\cli\cli.js"
  if (-not (Test-Path $builderCli)) {
    throw "electron-builder CLI not found. Run 'npm install' first."
  }

  $builderArgs = @(
    $builderCli,
    "--projectDir", $installerProjectDir,
    "--prepackaged", $PortableExeFolder,
    "--win", "nsis",
    "--x64"
  )

  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Step "Building NSIS installer (attempt $attempt/$maxAttempts)"
    try {
      Invoke-Native -File "node" -Arguments $builderArgs
      break
    } catch {
      Write-Host "Attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
      if ($attempt -eq $maxAttempts) {
        throw "NSIS installer build failed after $maxAttempts attempts. See messages above."
      }
      Write-Host "Purging cache and retrying in 3 seconds..." -ForegroundColor DarkYellow
      Purge-ElectronBuilderCache
      Start-Sleep -Seconds 3
    }
  }

  $installerFile = Get-ChildItem -Path $installerOut -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue |
                   Select-Object -First 1
  if (-not $installerFile) {
    throw "Installer EXE was not produced in $installerOut"
  }

  Write-Ok "Installer build ready."
  Write-Host "  Folder:    $installerOut" -ForegroundColor Green
  Write-Host "  Installer: $($installerFile.FullName)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Interactive menu
# ---------------------------------------------------------------------------

function Show-Menu {
  Write-Section "Ample Guitar Chord Progression Helper — Build Menu"
  Write-Host ""
  Write-Host "  1) Portable EXE only     (fast — recommended for D&D testing)" -ForegroundColor White
  Write-Host "  2) NSIS installer only   (slower — makes a Setup.exe)"          -ForegroundColor White
  Write-Host "  3) Both (portable first, then installer)"                       -ForegroundColor White
  Write-Host "  Q) Quit"                                                        -ForegroundColor White
  Write-Host ""
  do {
    $choice = Read-Host "Choose 1, 2, 3 or Q"
    switch -Regex ($choice.Trim().ToUpper()) {
      "^1$"  { return "Portable" }
      "^2$"  { return "Installer" }
      "^3$"  { return "Both" }
      "^Q$"  { return "Quit" }
      default { Write-Host "Invalid choice, try again." -ForegroundColor DarkYellow }
    }
  } while ($true)
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

try {
  Write-Section "Ample Guitar Chord Progression Helper — Windows build"
  Write-Host "Project folder: $PSScriptRoot"

  Assert-Command -Name "node" -Hint "Install Node.js LTS from https://nodejs.org"
  Assert-Command -Name "npm.cmd" -Hint "npm ships with Node.js — reinstall Node if missing."

  if ($Mode -eq "Menu") { $Mode = Show-Menu }
  if ($Mode -eq "Quit") {
    Write-Host "Cancelled." -ForegroundColor DarkGray
    exit 0
  }

  $iconResolved = Resolve-IconPath -UserIcon $IconPath
  if ($iconResolved -ne "") {
    Write-Host "Icon: $iconResolved" -ForegroundColor DarkGray
  } else {
    Write-Host "Icon: default Electron icon (drop your own .ico into public\grafics\app.ico)" -ForegroundColor DarkGray
  }

  Ensure-Dependencies
  Build-WebBundle

  switch ($Mode) {
    "Portable"  { [void](Build-Portable  -IconResolved $iconResolved) }
    "Installer" { Build-Installer -IconResolved $iconResolved -PortableExeFolder "" }
    "Both"      {
      $portableFolder = Build-Portable -IconResolved $iconResolved
      Build-Installer -IconResolved $iconResolved -PortableExeFolder $portableFolder
    }
  }

  Write-Host ""
  Write-Ok "All done."
}
catch {
  Write-Host ""
  Write-Err $_.Exception.Message
  if (-not $NoPause) {
    Write-Host ""
    Write-Host "Press Enter to close..." -ForegroundColor DarkGray
    [void](Read-Host)
  }
  exit 1
}

if (-not $NoPause) {
  Write-Host ""
  Write-Host "Press Enter to close..." -ForegroundColor DarkGray
  [void](Read-Host)
}
