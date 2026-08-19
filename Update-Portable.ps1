# =============================================================================
# Update-Portable.ps1
#
# Instaleaza build-ul portabil NOU peste cel VECHI, PASTRAND mostrele de
# chitara din:
#   portable-out\Ample Guitar Chord Progression Helper-win32-x64\
#     resources\app\dist\guitar samples
#
# Mostrele NU se re-scriu (sunt mari si dureaza mult). Scriptul le MUTA
# temporar (instant, acelasi disc), face build-ul, apoi le muta inapoi.
#
# Folosire (din folderul proiectului, in PowerShell):
#   .\Update-Portable.ps1
# =============================================================================

param(
  [Parameter(Mandatory = $false)]
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$portableOut = Join-Path $PSScriptRoot "portable-out"
$appFolder   = Join-Path $portableOut "Ample Guitar Chord Progression Helper-win32-x64"
$samples     = Join-Path $appFolder "resources\app\dist\guitar samples"
$stash       = Join-Path $portableOut "_guitar-samples-stash"

$hadSamples = Test-Path $samples

try {
  # 1) Mutam mostrele deoparte (instant — doar redenumim folderul).
  if ($hadSamples) {
    if (Test-Path $stash) { Remove-Item $stash -Recurse -Force }
    Move-Item $samples $stash
    Write-Host "[OK] Mostrele au fost mutate temporar (pastrate)." -ForegroundColor Green
  } else {
    Write-Host "[i] Nu exista inca folderul 'guitar samples' — nimic de pastrat." -ForegroundColor DarkGray
  }

  # 2) Build portabil peste cel vechi (Build-Installer.ps1 sterge si reface
  #    folderul aplicatiei, inclusiv resources\app\dist).
  Write-Host "==> Build portabil (peste cel vechi)..." -ForegroundColor Yellow
  & (Join-Path $PSScriptRoot "Build-Installer.ps1") -Mode Portable -SkipInstall -NoPause

  # 3) Verificam ca build-ul a produs EXE-ul.
  $exe = Join-Path $appFolder "Ample Guitar Chord Progression Helper.exe"
  if (-not (Test-Path $exe)) {
    throw "Build-ul nu a produs EXE-ul la calea asteptata. Vezi mesajele de mai sus."
  }

  # 4) Aducem mostrele inapoi (instant).
  if ($hadSamples) {
    if (Test-Path $samples) { Remove-Item $samples -Recurse -Force }
    Move-Item $stash $samples
    Write-Host "[OK] Mostrele au fost restaurate la loc." -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "GATA. Programul portabil a fost actualizat, mostrele au ramas intacte." -ForegroundColor Green
  Write-Host "EXE: $exe" -ForegroundColor DarkGray
}
catch {
  # La eroare, punem mostrele inapoi ca sa nu le pierdem.
  if ($hadSamples -and (Test-Path $stash) -and -not (Test-Path $samples)) {
    Move-Item $stash $samples
    Write-Host "[!] Mostrele au fost restaurate dupa eroare." -ForegroundColor DarkYellow
  }
  Write-Host ""
  Write-Host "[EROARE] $($_.Exception.Message)" -ForegroundColor Red
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
