Param(
  [string]$Python = "py",
  [string]$Name = "geeks_pos_backend",
  [switch]$RequireVenv
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
  if ($RequireVenv) {
    throw "Virtual environment .venv topilmadi. Loyiha ildizida: python -m venv .venv  keyin .venv\Scripts\Activate.ps1 va pip install -r backend/requirements.txt"
  }
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

# INSTALLED_APPS dagi barcha loyiha ilovalari — to‘liq paket (modellar, migratsiyalar, apps.py).
$projectApps = @(
  "core", "accounts", "catalog", "inventory", "sales", "debt",
  "printing", "sync", "reports", "integrations", "licensing"
)
$collectProject = @()
foreach ($app in $projectApps) {
  $collectProject += "--collect-all"
  $collectProject += $app
}

# AppConfig modullari (Django import_module("core.apps") uchun aniq).
$hiddenApps = @(
  "core.apps", "accounts.apps", "catalog.apps", "inventory.apps", "sales.apps", "debt.apps",
  "printing.apps", "sync.apps", "reports.apps", "integrations.apps", "licensing.apps"
)
$hiddenImports = @()
foreach ($h in $hiddenApps) {
  $hiddenImports += "--hidden-import"
  $hiddenImports += $h
}

# PyInstaller tahlili: skript backend/ ichidan — core, config qo'shni paketlar sifatida topiladi.
$backendDir = Join-Path $root "backend"
$pyInstallerCommon = @(
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name", $Name,
  "--distpath", $distDir,
  "--workpath", $buildDir,
  "--paths", ".",
  "--hidden-import", "config",
  "--hidden-import", "config.settings",
  "--hidden-import", "config.urls",
  "--hidden-import", "config.wsgi",
  "--hidden-import", "dotenv",
  "--collect-submodules", "django",
  "--collect-submodules", "waitress",
  "--collect-submodules", "rest_framework",
  "--collect-submodules", "corsheaders"
) + $collectProject + $hiddenImports + @(
  "run_waitress.py"
)

Push-Location $backendDir
try {
  if (Test-Path $venvPython) {
    & $PythonCmd -m PyInstaller @pyInstallerCommon
  }
  else {
    & $Python -3 -m PyInstaller @pyInstallerCommon
  }
}
finally {
  Pop-Location
}

$sidecarExe = Join-Path $distDir "$Name.exe"
if (!(Test-Path $sidecarExe)) {
  throw "Sidecar exe topilmadi: $sidecarExe"
}

Write-Host "Sidecar self-check (django.setup + migrate)..." -ForegroundColor Cyan
& $sidecarExe --self-check
if ($LASTEXITCODE -ne 0) {
  throw "Sidecar --self-check muvaffaqiyatsiz (exit code: $LASTEXITCODE). PyInstaller yoki migratsiya xatosini tekshiring."
}

# Tauri `externalBin` fayli: geeks_pos_backend-<host-triple>.exe (masalan x86_64-pc-windows-msvc).
# PyInstaller faqat geeks_pos_backend.exe beradi — Tauri build kutgan nomga nusxa.
$rustcHost = $null
try {
  $rv = & rustc -vV 2>$null
  if ($rv) {
    foreach ($line in $rv) {
      if ($line -match '^\s*host:\s*(.+)\s*$') {
        $rustcHost = $Matches[1].Trim()
        break
      }
    }
  }
}
catch { }
if (-not $rustcHost) {
  $rustcHost = "x86_64-pc-windows-msvc"
}
$tripleExe = Join-Path $distDir "$Name-$rustcHost.exe"
Copy-Item -LiteralPath $sidecarExe -Destination $tripleExe -Force
Write-Host "Tauri externalBin uchun nusxa: $tripleExe" -ForegroundColor DarkGray

Write-Host "Sidecar build tayyor: $sidecarExe" -ForegroundColor Green
