Param(
  [string]$Python = "py",
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "[1/6] Cleaning old artifacts..." -ForegroundColor Cyan
if (Test-Path ".\backend\dist") { Remove-Item ".\backend\dist\*" -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path ".\backend\build") { Remove-Item ".\backend\build\*" -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path ".\src-tauri\target") { Remove-Item ".\src-tauri\target\*" -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "[2/6] Building backend sidecar..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ".\backend\scripts\build_sidecar.ps1" -Python $Python -Name "geeks_pos_backend"

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

Write-Host "[6/6] Done." -ForegroundColor Green
Write-Host "Installer output: .\src-tauri\target\release\bundle\" -ForegroundColor Green
