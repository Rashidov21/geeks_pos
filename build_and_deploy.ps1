Param(
  [string]$Python = "py",
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "[0/6] Preflight (py, npm, npx)..." -ForegroundColor Cyan
foreach ($cmd in @("py", "npm", "npx")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Talab qilinadigan buyruq topilmadi: '$cmd'. PATH ga qo'shing yoki o'rnating."
  }
}

Write-Host "[1/6] Cleaning old artifacts..." -ForegroundColor Cyan
if (Test-Path ".\backend\dist") { Remove-Item ".\backend\dist\*" -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path ".\backend\build") { Remove-Item ".\backend\build\*" -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path ".\src-tauri\target") { Remove-Item ".\src-tauri\target\*" -Recurse -Force -ErrorAction SilentlyContinue }
$repoDb = ".\backend\db.sqlite3"
if (Test-Path $repoDb) {
  throw "Clean release rad etildi: $repoDb topildi. Bu fayl eski user/PINni yangi installga ko‘chirib yuborishi mumkin."
}

Write-Host "[2/6] Building backend sidecar..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ".\backend\scripts\build_sidecar.ps1" -Python $Python -Name "geeks_pos_backend" -RequireVenv

$sidecarExe = ".\backend\dist\geeks_pos_backend.exe"
if (!(Test-Path $sidecarExe)) {
  throw "Sidecar build failed: $sidecarExe topilmadi."
}

Write-Host "[3/6] Verifying sidecar output..." -ForegroundColor Cyan
$hash = Get-FileHash $sidecarExe -Algorithm SHA256
Write-Host ("Sidecar SHA256: " + $hash.Hash) -ForegroundColor DarkGray

Write-Host "[4/6] Building frontend..." -ForegroundColor Cyan
if (-not $SkipNpmInstall) {
  npm install --prefix frontend
}
npm run build --prefix frontend

Write-Host "[5/6] Building Tauri desktop installer..." -ForegroundColor Cyan
npx tauri build --config src-tauri/tauri.conf.json

Write-Host "Tauri release ichida sidecar tekshiruvi..." -ForegroundColor Cyan
$releaseDir = Join-Path $root "src-tauri\target\release"
$sidecarInRelease = Get-ChildItem -Path $releaseDir -Filter "geeks_pos_backend*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sidecarInRelease) {
  throw "Tauri build: externalBin sidecar topilmadi: $releaseDir\geeks_pos_backend*.exe (tauri.conf.json externalBin)"
}
Write-Host ("Sidecar (release): " + $sidecarInRelease.FullName) -ForegroundColor DarkGray

Write-Host "[6/6] Done." -ForegroundColor Green
Write-Host "Installer output: .\src-tauri\target\release\bundle\" -ForegroundColor Green
