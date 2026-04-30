Param(
  [string]$Python = "py",
  [switch]$SkipNpmInstall,
  [switch]$SkipClean,
  [switch]$SkipRustTargetOnClean
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== Geeks POS: production build ===" -ForegroundColor Cyan

foreach ($cmd in @("py", "npm", "npx", "rustc")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Required command not on PATH: $cmd"
  }
}

if (-not $SkipClean) {
  $cleanArgs = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\clean-build-artifacts.ps1"))
  if ($SkipRustTargetOnClean) {
    $cleanArgs += "-SkipRustTarget"
  }
  powershell @cleanArgs
}

$repoDb = Join-Path $root "backend\db.sqlite3"
if (Test-Path $repoDb) {
  throw "Release blocked: backend\db.sqlite3 exists. Remove or move (never ship user DB in installer)."
}

Write-Host "[1/4] Backend sidecar (PyInstaller)..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $root "backend\scripts\build_sidecar.ps1") -Python $Python -Name "geeks_pos_backend" -RequireVenv

$sidecar = Join-Path $root "backend\dist\geeks_pos_backend.exe"
if (-not (Test-Path $sidecar)) {
  throw "Sidecar missing: $sidecar"
}

Write-Host "[2/4] Frontend (Vite production)..." -ForegroundColor Cyan
if (-not $SkipNpmInstall) {
  npm install --prefix frontend
}
npm run build --prefix frontend

Write-Host "[3/4] Tauri bundle (MSI/NSIS/setup - targets from tauri.conf.json)..." -ForegroundColor Cyan
Push-Location $root
try {
  npx tauri build --config src-tauri/tauri.conf.json
}
finally {
  Pop-Location
}

Write-Host "[4/4] Verify bundled sidecar in release..." -ForegroundColor Cyan
$releaseDir = Join-Path $root "src-tauri\target\release"
$sidecarInRelease = Get-ChildItem -Path $releaseDir -Filter "geeks_pos_backend*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sidecarInRelease) {
  throw "Tauri release folder missing geeks_pos_backend*.exe - check tauri.conf.json bundle.externalBin"
}
Write-Host "OK: $($sidecarInRelease.FullName)" -ForegroundColor DarkGray

Write-Host ""
Write-Host "Build finished. Installers under:" -ForegroundColor Green
Write-Host "  $(Join-Path $root 'src-tauri\target\release\bundle\')" -ForegroundColor Green
Write-Host "Post-install: docs/PRODUCTION_POST_INSTALL.md" -ForegroundColor DarkGray
