# =============================================================================
# Update-Portable.ps1
#
# WORKFLOW: librariile de chitara traiesc DOAR in programul portabil:
#
#   portable-out\Ample Guitar Chord Progression Helper-win32-x64\
#     resources\app\dist\guitar samples\   <-- aici pui librariile (.dwp + WAV)
#
# In folderul sursa (public\guitar samples) NU mai tii librarii — ramane gol.
# Asa NU mai copiezi niciodata mostrele la fiecare update.
#
# Scriptul face:
#   1. MUTA temporar (instant, acelasi disc) folderul 'guitar samples' din
#      programul portabil, ca build-ul sa nu-l stearga.
#   2. Ruleaza Build-Installer.ps1 -Mode Portable -SkipInstall (build NOU peste
#      cel vechi).
#   3. MUTA inapoi folderul 'guitar samples' in noul portabil.
#   4. La orice eroare, restaureaza automat mostrele (nu le pierzi).
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
    $libCount = (Get-ChildItem -Path $stash -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host "[OK] Mostre pastrate temporar: $libCount librarie(-i) in 'guitar samples'." -ForegroundColor Green
  } else {
    Write-Host "[i] Nu exista inca 'guitar samples' in portabil — nimic de pastrat." -ForegroundColor DarkGray
  }

  # 2) Build portabil peste cel vechi. Sursa (public/guitar samples) e goala,
  #    deci build-ul produce doar folderul gol 'guitar samples' in dist.
  Write-Host "==> Build portabil (peste cel vechi)..." -ForegroundColor Yellow
  & (Join-Path $PSScriptRoot "Build-Installer.ps1") -Mode Portable -SkipInstall -NoPause

  # 3) Verificam ca build-ul a produs EXE-ul.
  $exe = Join-Path $appFolder "Ample Guitar Chord Progression Helper.exe"
  if (-not (Test-Path $exe)) {
    throw "Build-ul nu a produs EXE-ul la calea asteptata. Vezi mesajele de mai sus."
  }

  # 4) Aducem mostrele inapoi (instant) — inlocuiesc folderul gol nou.
  if ($hadSamples) {
    if (Test-Path $samples) { Remove-Item $samples -Recurse -Force }
    Move-Item $stash $samples
    Write-Host "[OK] Mostrele au fost restaurate in noul portabil." -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "GATA. Programul e actualizat, librariile au ramas in portabil." -ForegroundColor Green
  Write-Host "EXE: $exe" -ForegroundColor DarkGray
  Write-Host "Librarii: $samples" -ForegroundColor DarkGray
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
