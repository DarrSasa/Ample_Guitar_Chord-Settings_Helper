# =============================================================================
# Ample Guitar Chord Progression Helper - Download GM guitar soundfonts
#
# Downloads the seven General MIDI guitar packs from the MusyngKite CDN into
# public/soundfonts/ so the app can load them locally (no internet required
# at runtime). Run this ONCE after cloning the repo (or after 'git pull' if
# public/soundfonts/ is missing). Build-Installer.ps1 also runs it on
# demand if the folder is empty.
#
# Usage from PowerShell in the project folder:
#   .\Download-Soundfonts.ps1              (skip files already downloaded)
#   .\Download-Soundfonts.ps1 -Force       (re-download everything)
#
# Source (Creative Commons BY-SA 3.0):
#   https://gleitz.github.io/midi-js-soundfonts/MusyngKite/
#   https://github.com/gleitz/midi-js-soundfonts
# =============================================================================

param(
  [Parameter(Mandatory = $false)]
  [switch]$Force,

  [Parameter(Mandatory = $false)]
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$instruments = @(
  "acoustic_guitar_nylon",
  "acoustic_guitar_steel",
  "electric_guitar_jazz",
  "electric_guitar_clean",
  "electric_guitar_muted",
  "overdriven_guitar",
  "distortion_guitar"
)

# Primary + fallback CDN mirrors. We try each in order so users behind a
# firewall / ISP / country block that reaches one host still get the file
# from another. Kept generous on purpose - the user asked for maximum
# resilience. Every entry must expose the -mp3.js files at the shown path.
# Sources:
#   https://github.com/gleitz/midi-js-soundfonts  (upstream repo)
#   https://gleitz.github.io/midi-js-soundfonts/  (GitHub Pages)
#   https://www.jsdelivr.com/                     (jsDelivr, incl. fastly)
#   https://statically.io/                        (Statically, Cloudflare)
#   https://raw.githack.com/                      (githack, Cloudflare)
$mirrors = @(
  # Official GitHub Pages hosting for the upstream repo.
  "https://gleitz.github.io/midi-js-soundfonts/MusyngKite",
  # jsDelivr - global CDN, mirrors GitHub master branch.
  "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/MusyngKite",
  # jsDelivr on Fastly PoP - useful when the main jsDelivr host is blocked.
  "https://fastly.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/MusyngKite",
  # Statically - Cloudflare-backed CDN that mirrors GitHub raw files.
  "https://cdn.statically.io/gh/gleitz/midi-js-soundfonts/master/MusyngKite",
  # githack - Cloudflare CDN in front of raw GitHub, gives real MIME types.
  "https://raw.githack.com/gleitz/midi-js-soundfonts/master/MusyngKite",
  # githack (rawcdn variant) - permanent immutable cache, different PoPs.
  "https://rawcdn.githack.com/gleitz/midi-js-soundfonts/master/MusyngKite",
  # ghproxy mirror - popular in regions where GitHub itself is throttled.
  "https://mirror.ghproxy.com/https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/master/MusyngKite",
  # Direct GitHub raw as last resort - slowest but always the source of truth.
  "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/master/MusyngKite"
)

$outDir = Join-Path $PSScriptRoot "public\soundfonts"
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

function Write-Section {
  param([string]$Text)
  Write-Host ""
  Write-Host "===============================================" -ForegroundColor Cyan
  Write-Host " $Text" -ForegroundColor Cyan
  Write-Host "===============================================" -ForegroundColor Cyan
}

function Format-Bytes {
  param([long]$Bytes)
  if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
  if ($Bytes -ge 1KB) { return "{0:N1} KB" -f ($Bytes / 1KB) }
  return "$Bytes bytes"
}

function Download-With-Fallback {
  param(
    [string]$FileName,
    [string]$DestPath
  )
  # Ensure TLS 1.2 is enabled - required by most CDNs today. PowerShell 5.1
  # defaults to TLS 1.0 which many hosts have already disabled.
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

  $idx = 0
  foreach ($mirror in $mirrors) {
    $idx++
    $url = "$mirror/$FileName"
    # Show short host name to keep the log readable.
    $shortHost = ([Uri]$mirror).Host
    Write-Host ("  [{0}/{1}] {2} ..." -f $idx, $mirrors.Count, $shortHost) -NoNewline
    try {
      # Invoke-WebRequest -TimeoutSec gives us a per-mirror timeout so a
      # slow / hung mirror can't block the whole batch. WebClient would
      # ignore ProxyServer timeouts here.
      $prevProgress = $ProgressPreference
      $ProgressPreference = "SilentlyContinue"
      try {
        Invoke-WebRequest -Uri $url -OutFile $DestPath -UseBasicParsing `
                          -TimeoutSec 30 -UserAgent "Mozilla/5.0" -ErrorAction Stop | Out-Null
      } finally {
        $ProgressPreference = $prevProgress
      }
      $size = (Get-Item $DestPath).Length
      if ($size -lt 1024) {
        # Suspiciously small - probably an HTML error page or redirect.
        # Delete and try next.
        Remove-Item $DestPath -Force -ErrorAction SilentlyContinue
        Write-Host " too small, discarding" -ForegroundColor DarkYellow
        continue
      }
      Write-Host (" ok ({0})" -f (Format-Bytes $size)) -ForegroundColor Green
      return $true
    } catch {
      $reason = $_.Exception.Message
      # Keep the reason short so it fits on one line.
      if ($reason.Length -gt 60) { $reason = $reason.Substring(0, 57) + "..." }
      Write-Host (" failed ({0})" -f $reason) -ForegroundColor DarkYellow
      # Clean up partial download before trying next mirror.
      if (Test-Path $DestPath) { Remove-Item $DestPath -Force -ErrorAction SilentlyContinue }
    }
  }
  return $false
}

try {
  Write-Section "Downloading GM guitar soundfonts"
  Write-Host "Destination: $outDir"
  Write-Host "Instruments: $($instruments.Count)"

  $downloaded = 0
  $skipped = 0
  $failed = @()
  $totalSize = 0L

  foreach ($inst in $instruments) {
    $fileName = "$inst-mp3.js"
    $dest = Join-Path $outDir $fileName

    if ((Test-Path $dest) -and -not $Force) {
      $size = (Get-Item $dest).Length
      # Cached files smaller than 100 KB are suspicious - probably a
      # partial download from a previous run. Force re-download.
      if ($size -lt 100KB) {
        Write-Host ""
        Write-Host "$fileName (cached but tiny, re-downloading)" -ForegroundColor DarkYellow
        Remove-Item $dest -Force
      } else {
        Write-Host ""
        Write-Host "$fileName already present ($(Format-Bytes $size)), skipping" -ForegroundColor DarkGray
        $skipped++
        $totalSize += $size
        continue
      }
    }

    Write-Host ""
    Write-Host "$fileName" -ForegroundColor White
    if (Download-With-Fallback -FileName $fileName -DestPath $dest) {
      $downloaded++
      $totalSize += (Get-Item $dest).Length
    } else {
      $failed += $fileName
    }
  }

  Write-Section "Summary"
  Write-Host "Downloaded : $downloaded" -ForegroundColor Green
  Write-Host "Cached     : $skipped"    -ForegroundColor DarkGray
  Write-Host "Failed     : $($failed.Count)" -ForegroundColor $(if ($failed.Count -gt 0) { "Red" } else { "Green" })
  Write-Host "Total size : $(Format-Bytes $totalSize)"
  if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed files (all mirrors exhausted):" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Check your internet connection / proxy / antivirus and re-run:" -ForegroundColor DarkYellow
    Write-Host "  .\Download-Soundfonts.ps1" -ForegroundColor DarkYellow
    if (-not $NoPause) {
      Write-Host ""
      Write-Host "Press Enter to close..." -ForegroundColor DarkGray
      [void](Read-Host)
    }
    exit 1
  }

  Write-Host ""
  Write-Host "[OK] All soundfonts ready in public\soundfonts\" -ForegroundColor Green
  Write-Host "     Now build the portable EXE:" -ForegroundColor DarkGray
  Write-Host "     .\Build-Installer.ps1 -Mode Portable" -ForegroundColor DarkGray
}
catch {
  Write-Host ""
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
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
