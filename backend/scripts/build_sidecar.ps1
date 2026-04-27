Param(
  [string]$Python = "py",
  [string]$Name = "geeks_pos_backend"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

if (!(Test-Path ".venv")) {
  Write-Host "Virtual environment .venv topilmadi. Davom etyapman..." -ForegroundColor Yellow
}

$distDir = Join-Path $root "backend\dist"
$buildDir = Join-Path $root "backend\build\sidecar"

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

& $Python -3 -m pip install -r "backend/requirements.txt"
& $Python -3 -m pip install pyinstaller

& $Python -3 -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name $Name `
  --distpath $distDir `
  --workpath $buildDir `
  --paths "$root\backend" `
  --collect-submodules django `
  --collect-submodules waitress `
  --collect-submodules rest_framework `
  --collect-submodules corsheaders `
  "backend/run_waitress.py"

Write-Host "Sidecar build tayyor: $distDir\$Name.exe" -ForegroundColor Green
