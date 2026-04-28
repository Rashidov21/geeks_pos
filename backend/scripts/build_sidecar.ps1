Param(
  [string]$Python = "py",
  [string]$Name = "geeks_pos_backend"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
  $PythonCmd = $venvPython
  Write-Host "Python manbasi: .venv" -ForegroundColor Cyan
}
else {
  $PythonCmd = "$Python -3"
  Write-Host "Virtual environment .venv topilmadi. Global Python ishlatiladi." -ForegroundColor Yellow
}

$distDir = Join-Path $root "backend\dist"
$buildDir = Join-Path $root "backend\build\sidecar"

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

if (Test-Path $venvPython) {
  & $PythonCmd -m pip install -r "backend/requirements.txt"
  & $PythonCmd -m pip install pyinstaller
}
else {
  & $Python -3 -m pip install -r "backend/requirements.txt"
  & $Python -3 -m pip install pyinstaller
}

if (Test-Path $venvPython) {
  & $PythonCmd -m PyInstaller `
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
}
else {
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
}

Write-Host "Sidecar build tayyor: $distDir\$Name.exe" -ForegroundColor Green
